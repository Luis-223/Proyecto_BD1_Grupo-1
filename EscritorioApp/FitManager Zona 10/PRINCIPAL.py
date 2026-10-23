import queue                                # Cola para pasar resultados del hilo de la BD a la ventana
import threading                            # Hilos: la BD trabaja aparte y la ventana no se congela
import tkinter as tk
from datetime import date, datetime, timedelta   # Fechas de clases y del chat
from tkinter import ttk, messagebox         # Tablas y ventanas emergentes de aviso

import customtkinter as ctk                 # Librería de interfaz moderna

import conexion_bd as bd                    # TODO lo que habla con SQL Server está en conexion_bd.py
import factura_pdf                          # Crea, abre e imprime el PDF de las facturas

# ------------------------- CONFIGURACIÓN GLOBAL ------------------------------
ctk.set_appearance_mode("dark")             # Modo oscuro
ctk.set_default_color_theme("green")        # Tema de color por defecto de los widgets (botones)

ACCENT = "#22c55e"                          # Color de verde usado en títulos, números y selección
CARD = "#1f2937"                            # Color de fondo de las "tarjetas" (gris oscuro)

# Colores del chat (estilo WhatsApp oscuro)
CHAT_FONDO = "#0b141a"                      # Fondo de la conversación
CHAT_MIO = "#005c4b"                        # Globo de mis mensajes (derecha)
CHAT_OTRO = "#202c33"                       # Globo de los mensajes del otro (izquierda)
CHAT_HORA = "#8696a0"                       # Hora y palomitas
CHAT_LEIDO = "#53bdeb"                      # Palomitas azules (✓✓ leído)
COLORES_AVATAR = ["#0ea5e9", "#a855f7", "#f97316", "#14b8a6", "#ef4444", "#eab308", "#6366f1", "#ec4899"]

SEGUNDOS_REVISAR_CHAT = 3                   # Cada cuánto se buscan mensajes nuevos en el chat abierto
SEGUNDOS_REVISAR_CONTACTOS = 10             # Cada cuánto se actualiza la lista de chats
SEGUNDOS_REVISAR_AVISO = 15                 # Cada cuánto se actualiza el número de "💬 Chat con clientes (3)"


# =============================================================================
# AYUDANTES
# =============================================================================
def dinero(valor):
    """1234.5 -> 'Q 1,234.50'"""
    return f"Q {valor or 0:,.2f}"


def fecha(valor):
    return valor.strftime("%d/%m/%Y") if valor else ""


def fecha_hora(valor):
    return valor.strftime("%d/%m/%Y %H:%M") if valor else ""


def texto_cliente(c):
    """Lo que se ve en la lista de clientes. El DPI/NIT evita confundir a dos con el mismo nombre."""
    return f"{c['nombre']} — {c['nit_dpi']}"


def llenar_combo(combo, opciones):
    """Pone las opciones en una lista desplegable y selecciona la primera."""
    valores = list(opciones)
    combo.configure(values=valores)
    combo.set(valores[0] if valores else "")


def hora_corta(valor):
    """datetime -> '9:05 p. m.'"""
    return valor.strftime("%I:%M").lstrip("0") + (" a. m." if valor.hour < 12 else " p. m.")


def dia_chat(valor):
    """Separador de días del chat: 'Hoy', 'Ayer' o '21/10/2026'."""
    hoy = date.today()
    if valor == hoy:
        return "Hoy"
    if valor == hoy - timedelta(days=1):
        return "Ayer"
    return valor.strftime("%d/%m/%Y")


def fecha_lista_chat(valor):
    """Hora del último mensaje en la lista de chats: '9:05 p. m.', 'Ayer' o '19/10/26'."""
    if not valor:
        return ""
    if valor.date() == date.today():
        return hora_corta(valor)
    if valor.date() == date.today() - timedelta(days=1):
        return "Ayer"
    return valor.strftime("%d/%m/%y")


def iniciales(nombre):
    partes = (nombre or "?").split()
    return "".join(p[0] for p in partes[:2]).upper() or "?"


def recortar(texto, largo):
    texto = " ".join((texto or "").split())          # sin saltos de línea
    return texto if len(texto) <= largo else texto[:largo - 1] + "…"


# =============================================================================
# Crear una tabla con estilo oscuro
# =============================================================================
# parent  -> contenedor donde se colocará la tabla
# columns -> tupla con los nombres de las columnas
# height  -> cantidad de filas visibles a la vez
def make_table(parent, columns, height=10):
    style = ttk.Style()
    style.theme_use("default")              # Usa el tema base para poder personalizar colores

    # Estilo del cuerpo de la tabla: fondo oscuro, texto blanco, filas de 30px de alto
    style.configure("Treeview", background="#111827", foreground="white",
                    fieldbackground="#111827", rowheight=30, borderwidth=0)
    # Estilo del encabezado (fila de títulos de columnas)
    style.configure("Treeview.Heading", background="#374151", foreground="white", relief="flat")
    # Colores cuando una fila está seleccionada (fondo verde, texto negro)
    style.map("Treeview", background=[("selected", ACCENT)], foreground=[("selected", "black")])

    # Crea la tabla; show="headings" oculta la columna extra de árbol y solo muestra las columnas
    tree = ttk.Treeview(parent, columns=columns, show="headings", height=height, selectmode="browse")
    for c in columns:
        tree.heading(c, text=c)             # Título visible de la columna
        tree.column(c, anchor="w", width=140)   # Alineada a la izquierda ("w") y ancho de 140px
    return tree


# Reemplaza las filas de una tabla.
# filas -> lista de (id, valores). El id (id_clase, id_cliente...) queda guardado
#          en la fila, así al seleccionarla sabemos a qué registro de la BD corresponde.
def llenar_tabla(tree, filas):
    tree.delete(*tree.get_children())
    for clave, valores in filas:
        tree.insert("", "end", iid=str(clave), values=valores)


# =============================================================================
# VENTANA BASE: ejecuta las consultas en otro hilo
# =============================================================================
# Una consulta puede tardar (la base de Azure tarda hasta un minuto en
# despertar). Si se hiciera en el hilo de la ventana, esta se congelaría
# ("No responde"). Por eso:
#   1. en_segundo_plano() manda el trabajo a otro hilo
#   2. cuando termina, deja el resultado en una cola
#   3. la ventana revisa la cola cada 50 ms y dibuja el resultado
# (tkinter solo se puede tocar desde el hilo de la ventana)
class Ventana(ctk.CTk):
    def __init__(self):
        super().__init__()
        self._cola = queue.Queue()
        self._cerrada = False
        self._temporizadores = set()        # after() pendientes, para cancelarlos al cerrar
        self._revision = self.after(50, self._revisar_cola)

    # Ejecuta fn dentro de "ms" milisegundos (como after), pero se cancela sola al cerrar la ventana
    def programar(self, ms, fn):
        if self._cerrada:
            return None

        def correr():
            self._temporizadores.discard(id_)
            if not self._cerrada:
                fn()
        id_ = self.after(ms, correr)
        self._temporizadores.add(id_)
        return id_

    def cancelar(self, id_):
        if id_ is not None:
            self._temporizadores.discard(id_)
            try:
                self.after_cancel(id_)
            except (tk.TclError, ValueError):
                pass

    def _revisar_cola(self):
        while not self._cerrada:
            try:
                funcion = self._cola.get_nowait()
            except queue.Empty:
                break
            try:
                funcion()
            except tk.TclError:
                pass                        # la página que pidió el dato ya se cerró
        if not self._cerrada:
            self._revision = self.after(50, self._revisar_cola)

    def destroy(self):
        self._cerrada = True
        for id_ in [self._revision, *self._temporizadores]:
            try:
                self.after_cancel(id_)
            except (tk.TclError, ValueError):
                pass
        self._temporizadores.clear()
        super().destroy()

    def _habilitar(self, boton):
        if boton is not None and boton.winfo_exists():
            boton.configure(state="normal")

    # trabajo      -> función que habla con la BD (corre en otro hilo)
    # al_terminar  -> función que recibe el resultado y lo dibuja (corre en la ventana)
    # al_fallar    -> función que recibe el mensaje de error (si no se da, sale una ventana de error)
    # boton        -> se desactiva mientras trabaja, para no cobrar dos veces con doble clic
    # silencioso   -> si falla, solo se escribe en la terminal
    def en_segundo_plano(self, trabajo, al_terminar=None, al_fallar=None, boton=None, silencioso=False):
        if boton is not None:
            boton.configure(state="disabled")

        def fallo(mensaje):
            self._habilitar(boton)
            if silencioso:
                print("[App]", mensaje)
            elif al_fallar is not None:
                al_fallar(mensaje)
            else:
                messagebox.showerror("FitManager", mensaje, parent=self)

        def hilo():
            try:
                resultado = trabajo()
            except (bd.ErrorBD, factura_pdf.ErrorPDF) as error:
                mensaje = str(error)
                self._cola.put(lambda: fallo(mensaje))
                return
            except Exception as error:      # un error de programación: que no se pierda
                print("[App] Error inesperado:", repr(error))
                mensaje = f"Error inesperado: {error}"
                self._cola.put(lambda: fallo(mensaje))
                return

            def listo():
                self._habilitar(boton)
                if al_terminar is not None:
                    al_terminar(resultado)
            self._cola.put(listo)

        threading.Thread(target=hilo, daemon=True).start()


# =============================================================================
# VENTANA DE LOGIN
# =============================================================================
class Login(Ventana):
    def __init__(self):
        super().__init__()                  # Inicializa la ventana base
        self.title("FitManager - Inicio de sesión")   # Texto de la barra de título
        self.geometry("420x520")            # Tamaño de la ventana (ancho x alto)
        self.resizable(False, False)        # No permite cambiar el tamaño
        self.empleado = None                # Se llena si el inicio de sesión es correcto

        # Tarjeta central que contiene todo el formulario (esquinas redondeadas)
        box = ctk.CTkFrame(self, corner_radius=16, fg_color=CARD)
        box.pack(expand=True, fill="both", padx=30, pady=30)

        # Logo (emoji), nombre de la app y subtítulo
        ctk.CTkLabel(box, text="🏋️", font=("Segoe UI Emoji", 54)).pack(pady=(30, 0))
        ctk.CTkLabel(box, text="FitManager", font=("Segoe UI", 28, "bold"), text_color=ACCENT).pack()
        ctk.CTkLabel(box, text="Gestión de gimnasio", text_color="gray").pack(pady=(0, 25))

        # Campo de texto para el usuario
        self.alias = ctk.CTkEntry(box, placeholder_text="Usuario", width=260, height=40)
        self.alias.pack(pady=8)

        # Campo de contraseña; show="•" oculta lo escrito con puntos
        self.pwd = ctk.CTkEntry(box, placeholder_text="Contraseña", show="•", width=260, height=40)
        self.pwd.pack(pady=8)
        # Presionar Enter dentro de la contraseña equivale a pulsar "Iniciar sesión"
        self.pwd.bind("<Return>", lambda e: self.entrar())

        # Etiqueta para mensajes de error (en rojo)
        self.msg = ctk.CTkLabel(box, text="", text_color="#f87171", wraplength=300)
        self.msg.pack()

        # Botón de iniciar sesión
        self.boton = ctk.CTkButton(box, text="Iniciar sesión", width=260, height=42, command=self.entrar)
        self.boton.pack(pady=15)

        # Si falta escritorio.env o algún dato, avisar desde el principio
        problemas = bd.revisar_configuracion()
        if problemas:
            self.msg.configure(text="\n".join(problemas))

    # Se ejecuta al pulsar el botón o presionar Enter
    def entrar(self):
        if self.boton.cget("state") == "disabled":
            return                          # ya hay un intento en curso
        usuario = self.alias.get()
        contrasena = self.pwd.get()
        self.msg.configure(text="Conectando…", text_color="gray")

        def correcto(empleado):
            self.empleado = empleado        # PRINCIPAL lo lee al cerrar esta ventana
            self.destroy()

        def incorrecto(mensaje):
            self.msg.configure(text=mensaje, text_color="#f87171")
            self.pwd.delete(0, "end")

        # El servidor revisa usuario y contraseña (Argon2, igual que la app móvil)
        self.en_segundo_plano(lambda: bd.iniciar_sesion(usuario, contrasena),
                              correcto, al_fallar=incorrecto, boton=self.boton)


# =============================================================================
# VENTANA PRINCIPAL
# =============================================================================
class App(Ventana):
    def __init__(self, empleado):
        super().__init__()
        self.title(f"FitManager - {empleado['sucursal']}")
        self.geometry("1200x720")           # Tamaño inicial
        self.minsize(1000, 620)             # Tamaño mínimo permitido al redimensionar

        # Datos de quien inició sesión (vienen de usp_Escritorio_DatosEmpleado)
        self.usuario = empleado["nombre"]
        self.id_usuario = empleado["id_usuario"]       # queda guardado en facturas y cambios
        self.id_sucursal = empleado["id_sucursal"]     # la sucursal de esta computadora (ID_SUCURSAL en escritorio.env)
        self.cerrar_sesion = False                     # True si se pulsa "Cerrar sesión"

        self.sucursal = empleado["sucursal"]
        self._pagina = 0                    # Sube cada vez que se cambia de página (para frenar las revisiones del chat)
        self._revisando = set()             # Revisiones automáticas en curso (para no amontonarlas)

        # ---------- Barra lateral (menú izquierdo) ----------
        side = ctk.CTkFrame(self, width=210, corner_radius=0, fg_color="#0b1220")
        side.pack(side="left", fill="y")    # Pegada a la izquierda, ocupa todo el alto
        ctk.CTkLabel(side, text="🏋️ FitManager", font=("Segoe UI", 20, "bold"),
                     text_color=ACCENT).pack(pady=(25, 25))

        # ---------- Área derecha: barra superior + contenido de la página ----------
        derecha = ctk.CTkFrame(self, fg_color="transparent")
        derecha.pack(side="right", fill="both", expand=True)

        # Barra superior con el indicador de sucursal (se ve en TODAS las páginas)
        barra = ctk.CTkFrame(derecha, fg_color="transparent", height=40)
        barra.pack(fill="x", padx=20, pady=(12, 0))
        indicador = ctk.CTkFrame(barra, fg_color="#14532d", corner_radius=16)
        indicador.pack(side="right")
        self.lbl_sucursal = ctk.CTkLabel(indicador, text=f"📍 Sucursal: {self.sucursal}",
                                         font=("Segoe UI", 13, "bold"), text_color="#bbf7d0")
        self.lbl_sucursal.pack(padx=14, pady=4)

        # Aquí se dibuja el contenido de cada página; se limpia y rellena al cambiar de menú
        self.main = ctk.CTkFrame(derecha, fg_color="transparent")
        self.main.pack(fill="both", expand=True, padx=20, pady=(4, 15))

        # Diccionario: texto del botón del menú -> función que dibuja la página
        self.pages = {"🏠  Inicio": self.p_inicio, "🧾  Facturación": self.p_factura,
                      "🕒  Cambio de horario": self.p_horario,
                      "🧑‍🏫  Entrenadores": self.p_entrenador,
                      "🛒  Venta de productos": self.p_productos,
                      "💬  Chat con clientes": self.p_chat}

        # Crea un botón en el menú por cada página (se guardan para resaltar el activo)
        self.botones_menu = {}
        for name, fn in self.pages.items():
            # "lambda f=fn" fija la función de esta iteración
            b = ctk.CTkButton(side, text=name, anchor="w", height=42, fg_color="transparent",
                              hover_color="#1f2937", command=lambda f=fn: self.show(f))
            b.pack(fill="x", padx=12, pady=3)
            self.botones_menu[fn.__name__] = b

        # Parte inferior del menú: nombre del usuario y botón de cerrar sesión
        ctk.CTkLabel(side, text=f"👤 {self.usuario}", text_color="gray").pack(side="bottom", pady=(0, 10))
        ctk.CTkButton(side, text="Cerrar sesión", fg_color="#7f1d1d", hover_color="#991b1b",
                      command=self.salir).pack(side="bottom", padx=12, pady=5, fill="x")

        # Al abrir la app: las membresías que ya terminaron pasan a 'Vencida'
        self.en_segundo_plano(bd.actualizar_membresias_vencidas, silencioso=True)

        # Al abrir la app se muestra la página de inicio
        self.show(self.p_inicio)

        # Aviso de mensajes de clientes sin leer en el botón "💬 Chat con clientes"
        self.revisar_no_leidos()

    # Cierra la sesión: PRINCIPAL vuelve a abrir el login
    def salir(self):
        self.cerrar_sesion = True
        self.destroy()

    # Cambia de página: borra todo lo que hay en el área principal y dibuja la nueva
    def show(self, fn):
        self._pagina += 1                       # Las revisiones de la página anterior (chat) se detienen
        for w in self.main.winfo_children():    # Recorre todos los widgets actuales
            w.destroy()                         # Los elimina
        for nombre, boton in self.botones_menu.items():   # Resalta en el menú la página abierta
            boton.configure(fg_color=CARD if nombre == fn.__name__ else "transparent")
        fn()                                    # Ejecuta el método que dibuja la nueva página

    # Revisión automática en segundo plano que NO se amontona: si la anterior
    # todavía no termina (internet lento), esta se salta. Si falla, no molesta con ventanas.
    def revisar(self, nombre, trabajo, al_terminar):
        if nombre in self._revisando:
            return
        self._revisando.add(nombre)

        def fin(resultado):
            self._revisando.discard(nombre)
            al_terminar(resultado)

        def fallo(mensaje):
            self._revisando.discard(nombre)
            print(f"[{nombre}]", mensaje)

        self.en_segundo_plano(trabajo, fin, al_fallar=fallo)

    # Mensajes de clientes sin leer, en el botón del menú: "💬  Chat con clientes  (3)"
    def actualizar_aviso_chat(self):
        boton = self.botones_menu["p_chat"]
        if not hasattr(self, "_color_menu"):
            self._color_menu = boton.cget("text_color")          # color normal del texto del menú

        def mostrar(cantidad):
            texto = "💬  Chat con clientes" + (f"  ({cantidad})" if cantidad else "")
            boton.configure(text=texto, text_color="#4ade80" if cantidad else self._color_menu)

        self.revisar("aviso_chat", lambda: bd.chat_sin_leer(), mostrar)

    def revisar_no_leidos(self):                 # se repite sola cada SEGUNDOS_REVISAR_AVISO
        self.actualizar_aviso_chat()
        self.programar(SEGUNDOS_REVISAR_AVISO * 1000, self.revisar_no_leidos)

    # Crea el PDF de una factura y lo abre (o lo manda a la impresora)
    # recien_creada -> si falla el PDF, aclarar que la factura SÍ se guardó
    def pdf_factura(self, id_factura, imprimir=False, boton=None, recien_creada=False):
        def trabajo():
            return factura_pdf.generar(bd.detalle_factura(id_factura))

        def listo(ruta):
            if imprimir and factura_pdf.imprimir(ruta):
                return messagebox.showinfo("Imprimir", f"Factura enviada a la impresora.\n\n{ruta}")
            try:
                factura_pdf.abrir(ruta)
            except factura_pdf.ErrorPDF as error:
                messagebox.showwarning("PDF", str(error))

        def fallo(mensaje):
            if recien_creada:
                mensaje = (f"La factura N° {id_factura} se guardó correctamente, pero no se pudo crear el PDF:\n\n"
                           f"{mensaje}\n\nPuedes intentarlo de nuevo desde Facturación → Ver PDF.")
            messagebox.showwarning("PDF de la factura", mensaje)

        self.en_segundo_plano(trabajo, listo, al_fallar=fallo, boton=boton)

    # Crea el título grande que aparece arriba de cada página
    def title_(self, text):
        ctk.CTkLabel(self.main, text=text, font=("Segoe UI", 24, "bold")).pack(anchor="w", pady=(0, 12))

    # Fila con un formulario (tarjeta gris)
    def card(self):
        f = ctk.CTkFrame(self.main, fg_color=CARD, corner_radius=12)
        f.pack(fill="x", pady=15)
        return f

    # -------------------------------------------------------------------------
    # PÁGINA: INICIO
    # -------------------------------------------------------------------------
    def p_inicio(self):
        self.title_(f"Bienvenido, {self.usuario}")

        # Fila contenedora de las 4 tarjetas de estadísticas
        row = ctk.CTkFrame(self.main, fg_color="transparent")
        row.pack(fill="x")

        titulos = ["Clientes activos", "Facturas hoy", "Clases esta semana", "Ventas del día"]
        numeros = []                                                 # Etiquetas que se llenan al llegar los datos
        for i, t in enumerate(titulos):
            c = ctk.CTkFrame(row, fg_color=CARD, corner_radius=12)   # Tarjeta individual
            c.grid(row=0, column=i, padx=6, sticky="ew")             # Una al lado de otra (columnas)
            row.columnconfigure(i, weight=1)                         # Todas del mismo ancho
            n = ctk.CTkLabel(c, text="…", font=("Segoe UI", 30, "bold"), text_color=ACCENT)
            n.pack(pady=(14, 0))                                     # Número grande
            ctk.CTkLabel(c, text=t, text_color="gray").pack(pady=(0, 14))   # Descripción
            numeros.append(n)

        ctk.CTkLabel(self.main, text="Usa el menú de la izquierda para gestionar el gimnasio.",
                     text_color="gray").pack(anchor="w", pady=20)

        def mostrar(r):
            valores = [r["clientes_activos"], r["facturas_hoy"], r["clases_semana"], dinero(r["ventas_hoy"])]
            for etiqueta, v in zip(numeros, valores):
                etiqueta.configure(text=str(v))

        self.en_segundo_plano(lambda: bd.resumen(), mostrar)   # GET /escritorio/resumen

    # -------------------------------------------------------------------------
    # PÁGINA: FACTURACIÓN MANUAL
    # -------------------------------------------------------------------------
    def p_factura(self):
        self.title_("Facturación manual")

        # Panel (tarjeta) con el formulario de facturación
        f = ctk.CTkFrame(self.main, fg_color=CARD, corner_radius=12)
        f.pack(fill="x", pady=5)

        # Campos del formulario (listas desplegables; se llenan desde la BD)
        cli = ctk.CTkComboBox(f, values=[], width=260, state="readonly")              # Cliente
        tipo = ctk.CTkComboBox(f, values=[], width=140, state="readonly")             # Tipo de membresía
        meses = ctk.CTkComboBox(f, values=[str(i) for i in range(1, 13)], width=70, state="readonly")
        meses.set("1")                                                                 # Cantidad de meses
        pago = ctk.CTkComboBox(f, values=[], width=140, state="readonly")             # Método de pago
        total = ctk.CTkLabel(f, text="Total: Q 0.00", font=("Segoe UI", 16, "bold"), text_color=ACCENT)

        # Lo que se ve en cada lista -> su id en la BD
        datos = {"clientes": {}, "tipos": {}, "metodos": {}}

        # Recalcula el total = precio de la membresía x cantidad de meses
        def calc(*_):
            t = datos["tipos"].get(tipo.get())
            total.configure(text=f"Total: {dinero(t['precio_base'] * int(meses.get()))}" if t else "Total: Q 0.00")
        tipo.configure(command=calc)
        meses.configure(command=calc)

        # Coloca cada campo en una columna: etiqueta arriba (fila 0) y campo abajo (fila 1)
        for i, (lbl, w) in enumerate([("Cliente", cli), ("Membresía", tipo), ("Meses", meses), ("Método", pago)]):
            ctk.CTkLabel(f, text=lbl, text_color="gray").grid(row=0, column=i, sticky="w", padx=10, pady=(10, 0))
            w.grid(row=1, column=i, padx=10, pady=(0, 12))
        total.grid(row=1, column=4, padx=15)

        boton = ctk.CTkButton(f, text="Generar factura", command=lambda: facturar())
        boton.grid(row=1, column=5, padx=10)

        # Tabla con el historial de facturas de esta sucursal
        tabla = make_table(self.main, ("N°", "Cliente", "Concepto", "Método", "Total", "Fecha"), height=12)
        tabla.column("Concepto", width=260)

        # Botones del historial: ver o imprimir el PDF de la factura seleccionada
        acciones = ctk.CTkFrame(self.main, fg_color="transparent")
        acciones.pack(side="bottom", fill="x")
        ctk.CTkLabel(acciones, text="Selecciona una factura del historial (doble clic = ver PDF)",
                     text_color="gray").pack(side="left")
        boton_imprimir = ctk.CTkButton(acciones, text="🖨  Imprimir", width=130, command=lambda: pdf(True))
        boton_imprimir.pack(side="right")
        boton_pdf = ctk.CTkButton(acciones, text="📄  Ver PDF", width=130, fg_color="#374151",
                                  hover_color="#4b5563", command=lambda: pdf(False))
        boton_pdf.pack(side="right", padx=10)

        tabla.pack(fill="both", expand=True, pady=10)

        def pdf(imprimir):
            sel = tabla.selection()             # su iid es el id_factura
            if not sel:
                return messagebox.showwarning("Aviso", "Selecciona una factura del historial.")
            self.pdf_factura(int(sel[0]), imprimir=imprimir, boton=boton_imprimir if imprimir else boton_pdf)
        tabla.bind("<Double-1>", lambda e: pdf(False))

        def mostrar_facturas(filas):
            llenar_tabla(tabla, [(r["id_factura"], (r["numero"], r["cliente"], r["concepto"], r["metodo"],
                                                    dinero(r["total"]), fecha_hora(r["fecha_emision"])))
                                 for r in filas])

        def recargar_facturas():
            self.en_segundo_plano(lambda: bd.listar_facturas(), mostrar_facturas)

        # Carga inicial: listas desplegables + historial
        def mostrar_todo(resultado):
            cat, facturas = resultado
            datos["clientes"] = {texto_cliente(c): c["id_cliente"] for c in cat["clientes"]}
            datos["tipos"] = {t["nombre_tipo"]: t for t in cat["tipos"]}
            datos["metodos"] = {m["nombre_metodo"]: m["id_metodo_pago"] for m in cat["metodos"]}
            llenar_combo(cli, datos["clientes"])
            llenar_combo(tipo, datos["tipos"])
            llenar_combo(pago, datos["metodos"])
            calc()
            mostrar_facturas(facturas)

        self.en_segundo_plano(lambda: (bd.catalogos(), bd.listar_facturas()),
                              mostrar_todo)

        # Acción del botón "Generar factura"
        def facturar():
            id_cliente = datos["clientes"].get(cli.get())
            t = datos["tipos"].get(tipo.get())
            id_metodo = datos["metodos"].get(pago.get())
            if id_cliente is None or t is None or id_metodo is None:
                return messagebox.showwarning("Aviso", "Elige cliente, membresía y método de pago.")
            n = int(meses.get())
            if not messagebox.askyesno("Confirmar factura",
                                       f"¿Facturar {t['nombre_tipo']} x{n} a {cli.get()}\n"
                                       f"por {dinero(t['precio_base'] * n)}?"):
                return

            def listo(r):
                messagebox.showinfo("Factura generada",
                                    f"Factura N° {r['id_factura']} por {dinero(r['total'])}.\n"
                                    f"Membresía vigente del {fecha(r['vigente_desde'])} "
                                    f"al {fecha(r['vigente_hasta'])}.\n\nSe abrirá el PDF de la factura.")
                recargar_facturas()
                self.pdf_factura(r["id_factura"], recien_creada=True)

            # usp_Escritorio_FacturarMembresia: Membresia + Factura + Detalle + Pago en una transacción
            self.en_segundo_plano(lambda: bd.facturar_membresia(id_cliente, t["id_tipo_membresia"], id_metodo, n),
                                  listo, boton=boton)

    # -------------------------------------------------------------------------
    # PÁGINA: CAMBIO DE HORARIO DE CLASES
    # -------------------------------------------------------------------------
    def p_horario(self):
        self.title_("Cambio de horario de clases")

        # Tabla con las próximas clases de la sucursal
        tabla = make_table(self.main, ("Clase", "Fecha y hora", "Entrenador", "Inscritos / cupo"), height=10)
        tabla.pack(fill="x")

        # Panel inferior con el campo para la nueva fecha/hora y el motivo
        f = self.card()
        ctk.CTkLabel(f, text="Nueva fecha y hora (AAAA-MM-DD HH:MM)").pack(side="left", padx=12, pady=15)
        nuevo = ctk.CTkEntry(f, width=150)
        nuevo.pack(side="left", padx=5)
        ctk.CTkLabel(f, text="Motivo").pack(side="left", padx=(12, 5))
        motivo = ctk.CTkEntry(f, width=200, placeholder_text="(opcional)")
        motivo.pack(side="left", padx=5)
        boton = ctk.CTkButton(f, text="Aplicar cambio", command=lambda: cambiar())
        boton.pack(side="left", padx=10)

        clases = {}                                 # id_clase -> datos de la clase

        def mostrar(filas):
            clases.clear()
            clases.update({r["id_clase"]: r for r in filas})
            llenar_tabla(tabla, [(r["id_clase"], (r["nombre_clase"], r["fecha_hora"].strftime("%Y-%m-%d %H:%M"),
                                                  r["entrenador"], f"{r['inscritos']} / {r['cupo_maximo']}"))
                                 for r in filas])

        def recargar():
            self.en_segundo_plano(lambda: bd.listar_clases(), mostrar)

        # Al elegir una clase, se copia su hora actual en el campo para editarla
        def al_seleccionar(_):
            sel = tabla.selection()
            if sel:
                nuevo.delete(0, "end")
                nuevo.insert(0, clases[int(sel[0])]["fecha_hora"].strftime("%Y-%m-%d %H:%M"))
        tabla.bind("<<TreeviewSelect>>", al_seleccionar)

        # Acción del botón "Aplicar cambio"
        def cambiar():
            sel = tabla.selection()             # Fila seleccionada (su iid es el id_clase)
            if not sel or not nuevo.get().strip():
                return messagebox.showwarning("Aviso", "Selecciona una clase y escribe la nueva hora.")
            try:
                nueva = datetime.strptime(nuevo.get().strip(), "%Y-%m-%d %H:%M")
            except ValueError:
                return messagebox.showwarning("Aviso", "La fecha debe tener el formato AAAA-MM-DD HH:MM\n"
                                                       "(por ejemplo 2026-10-25 18:30).")
            clase = clases[int(sel[0])]
            if not messagebox.askyesno("Confirmar cambio",
                                       f"¿Mover {clase['nombre_clase']} del "
                                       f"{fecha_hora(clase['fecha_hora'])} al {fecha_hora(nueva)}?"):
                return

            def listo(_):
                messagebox.showinfo("Horario", "Horario actualizado.")
                recargar()

            # usp_Escritorio_CambiarHorarioClase: valida, guarda el historial y actualiza
            self.en_segundo_plano(lambda: bd.cambiar_horario(clase["id_clase"], nueva, motivo.get().strip()),
                                  listo, boton=boton)

        recargar()

    # -------------------------------------------------------------------------
    # PÁGINA: ENTRENADORES DE LOS CLIENTES
    # -------------------------------------------------------------------------
    # Un cliente puede tener VARIOS entrenadores (07_entrenadores.sql), igual
    # que en la app móvil (mi_entrenador.tsx):
    #   "Agregar" suma el entrenador sin quitar los que ya tiene.
    #   "Quitar"  cierra esa asignación (queda en el historial).
    def p_entrenador(self):
        self.title_("Entrenadores de los clientes")

        # Tabla con cada cliente de la sucursal y TODOS sus entrenadores actuales
        tabla = make_table(self.main, ("Cliente", "Entrenadores actuales", "Último cambio"), height=10)
        tabla.column("Entrenadores actuales", width=320)
        tabla.pack(fill="x")

        # Panel inferior: elegir entrenador y agregar o quitar
        f = self.card()
        ctk.CTkLabel(f, text="Entrenador").pack(side="left", padx=12, pady=15)
        elegido = ctk.CTkComboBox(f, values=[], width=220, state="readonly")
        elegido.pack(side="left", padx=5)
        ctk.CTkLabel(f, text="Motivo").pack(side="left", padx=(12, 5))
        motivo = ctk.CTkEntry(f, width=180, placeholder_text="(opcional)")
        motivo.pack(side="left", padx=5)
        boton_agregar = ctk.CTkButton(f, text="➕  Agregar", width=110, command=lambda: accion(True))
        boton_agregar.pack(side="left", padx=(10, 5))
        boton_quitar = ctk.CTkButton(f, text="➖  Quitar", width=110, fg_color="#7f1d1d", hover_color="#991b1b",
                                     command=lambda: accion(False))
        boton_quitar.pack(side="left", padx=5)

        entrenadores = {}                           # nombre visible -> (id_entrenador, nombre)
        clientes = {}                               # id_cliente -> fila

        def mostrar_tabla(filas):
            clientes.clear()
            clientes.update({r["id_cliente"]: r for r in filas})
            llenar_tabla(tabla, [(r["id_cliente"], (r["cliente"], r["entrenador"], fecha(r["fecha_asignacion"])))
                                 for r in filas])

        def recargar_tabla():
            self.en_segundo_plano(lambda: bd.listar_asignaciones(), mostrar_tabla)

        def mostrar_todo(resultado):
            cat, asignaciones = resultado
            entrenadores.clear()
            for e in cat["entrenadores"]:
                visible = e["nombre"] + (f" ({e['especialidad']})" if e["especialidad"] else "")
                entrenadores[visible] = (e["id_entrenador"], e["nombre"])
            llenar_combo(elegido, entrenadores)
            mostrar_tabla(asignaciones)

        self.en_segundo_plano(lambda: (bd.catalogos(), bd.listar_asignaciones()),
                              mostrar_todo)

        # agregar=True  -> usp_Escritorio_CambiarEntrenador (07_entrenadores.sql: AGREGA sin quitar los demás)
        # agregar=False -> usp_Escritorio_QuitarEntrenador  (14_escritorio_facturas_chat.sql)
        def accion(agregar):
            sel = tabla.selection()                 # Fila (cliente) seleccionada
            dato = entrenadores.get(elegido.get())
            if not sel or dato is None:
                return messagebox.showwarning("Aviso", "Selecciona un cliente y un entrenador.")
            id_entrenador, nombre = dato
            cliente = clientes[int(sel[0])]

            if agregar:
                trabajo = lambda: bd.cambiar_entrenador(cliente["id_cliente"], id_entrenador, motivo.get().strip())
                aviso = f"{nombre} se agregó como entrenador de {cliente['cliente']}."
                boton = boton_agregar
            else:
                if not messagebox.askyesno("Quitar entrenador",
                                           f"¿Quitar a {nombre} como entrenador de {cliente['cliente']}?"):
                    return
                trabajo = lambda: bd.quitar_entrenador(cliente["id_cliente"], id_entrenador)
                aviso = f"{nombre} ya no es entrenador de {cliente['cliente']}."
                boton = boton_quitar

            def listo(_):
                messagebox.showinfo("Entrenadores", aviso)
                recargar_tabla()

            self.en_segundo_plano(trabajo, listo, boton=boton)

    # -------------------------------------------------------------------------
    # PÁGINA: VENTA DE PRODUCTOS
    # -------------------------------------------------------------------------
    def p_productos(self):
        self.title_("Venta de productos")

        # Contenedor que divide la página en dos: catálogo (izquierda) y carrito (derecha)
        cuerpo = ctk.CTkFrame(self.main, fg_color="transparent")
        cuerpo.pack(fill="both", expand=True)

        # Botones de productos (se crean al llegar el catálogo de la BD)
        izq = ctk.CTkScrollableFrame(cuerpo, fg_color=CARD, width=380, label_text="Catálogo")
        izq.pack(side="left", fill="y", padx=(0, 10))

        der = ctk.CTkFrame(cuerpo, fg_color="transparent")
        der.pack(side="right", fill="both", expand=True)

        # A quién se le vende y cómo paga (Factura.id_cliente es obligatorio)
        datos_venta = ctk.CTkFrame(der, fg_color=CARD, corner_radius=12)
        datos_venta.pack(fill="x", pady=(0, 10))
        ctk.CTkLabel(datos_venta, text="Cliente", text_color="gray").grid(row=0, column=0, sticky="w", padx=10, pady=(10, 0))
        ctk.CTkLabel(datos_venta, text="Método", text_color="gray").grid(row=0, column=1, sticky="w", padx=10, pady=(10, 0))
        cli = ctk.CTkComboBox(datos_venta, values=[], width=260, state="readonly")
        cli.grid(row=1, column=0, padx=10, pady=(0, 12))
        pago = ctk.CTkComboBox(datos_venta, values=[], width=140, state="readonly")
        pago.grid(row=1, column=1, padx=10, pady=(0, 12))

        # Carrito
        carrito_tabla = make_table(der, ("Producto", "Cant.", "Subtotal"), height=10)
        carrito_tabla.pack(fill="both", expand=True)

        # Total y botones
        abajo = ctk.CTkFrame(self.main, fg_color="transparent")
        abajo.pack(fill="x", pady=8)
        boton_cobrar = ctk.CTkButton(abajo, text="Cobrar", height=40, command=lambda: cobrar())
        boton_cobrar.pack(side="right")
        ctk.CTkButton(abajo, text="Quitar uno", height=40, fg_color="#374151", hover_color="#4b5563",
                      command=lambda: quitar()).pack(side="right", padx=10)
        total = ctk.CTkLabel(abajo, text="Total: Q 0.00", font=("Segoe UI", 18, "bold"), text_color=ACCENT)
        total.pack(side="right", padx=10)

        productos = {}                      # id_producto -> fila del catálogo
        carrito = {}                        # id_producto -> cantidad
        listas = {"clientes": {}, "metodos": {}}

        def refrescar_carrito():
            llenar_tabla(carrito_tabla, [(i, (productos[i]["nombre_producto"], c,
                                              dinero(productos[i]["precio_venta"] * c)))
                                         for i, c in carrito.items()])
            suma = sum(productos[i]["precio_venta"] * c for i, c in carrito.items())
            total.configure(text=f"Total: {dinero(suma)}")

        # Agrega un producto al carrito (si ya estaba, suma 1)
        def agregar(id_producto):
            p = productos[id_producto]
            cantidad = carrito.get(id_producto, 0) + 1
            if p["stock"] is not None and cantidad > p["stock"]:
                return messagebox.showwarning("Aviso", f"Solo hay {p['stock']} de {p['nombre_producto']} en esta sucursal.")
            carrito[id_producto] = cantidad
            refrescar_carrito()

        # Quita una unidad del producto seleccionado en el carrito
        def quitar():
            sel = carrito_tabla.selection()
            if not sel:
                return
            i = int(sel[0])
            carrito[i] -= 1
            if carrito[i] <= 0:
                del carrito[i]
            refrescar_carrito()

        # Crea un botón por cada producto del catálogo
        def dibujar_catalogo(filas):
            for w in izq.winfo_children():
                w.destroy()
            productos.clear()
            productos.update({p["id_producto"]: p for p in filas})
            for p in filas:
                existencia = "" if p["stock"] is None else f"   ({p['stock']} disp.)"
                ctk.CTkButton(izq, text=f"{p['nombre_producto']}   —   {dinero(p['precio_venta'])}{existencia}",
                              anchor="w", state="disabled" if p["stock"] == 0 else "normal",
                              command=lambda i=p["id_producto"]: agregar(i)).pack(fill="x", pady=3, padx=5)
            for i in [i for i in carrito if i not in productos]:   # productos que ya no están
                del carrito[i]
            refrescar_carrito()

        def mostrar_todo(resultado):
            cat, catalogo = resultado
            listas["clientes"] = {texto_cliente(c): c["id_cliente"] for c in cat["clientes"]}
            listas["metodos"] = {m["nombre_metodo"]: m["id_metodo_pago"] for m in cat["metodos"]}
            llenar_combo(cli, listas["clientes"])
            llenar_combo(pago, listas["metodos"])
            dibujar_catalogo(catalogo)

        self.en_segundo_plano(lambda: (bd.catalogos(), bd.listar_productos()),
                              mostrar_todo)

        # Acción del botón "Cobrar": registra la venta en la BD y limpia el carrito
        def cobrar():
            if not carrito:
                return messagebox.showwarning("Aviso", "El carrito está vacío.")
            id_cliente = listas["clientes"].get(cli.get())
            id_metodo = listas["metodos"].get(pago.get())
            if id_cliente is None or id_metodo is None:
                return messagebox.showwarning("Aviso", "Elige el cliente y el método de pago.")
            suma = sum(productos[i]["precio_venta"] * c for i, c in carrito.items())
            if not messagebox.askyesno("Confirmar venta", f"¿Cobrar {dinero(suma)} a {cli.get()}?"):
                return

            def listo(r):
                messagebox.showinfo("Venta", f"Venta registrada. Factura N° {r['id_factura']} por {dinero(r['total'])}."
                                             "\n\nSe abrirá el PDF de la factura.")
                self.pdf_factura(r["id_factura"], recien_creada=True)
                carrito.clear()
                # Recarga el catálogo para ver las existencias nuevas
                self.en_segundo_plano(lambda: bd.listar_productos(), dibujar_catalogo)

            # usp_Escritorio_VenderProductos: Factura + Detalle + inventario + Pago en una transacción
            self.en_segundo_plano(lambda: bd.vender_productos(id_cliente, id_metodo, dict(carrito)),
                                  listo, boton=boton_cobrar)

    # -------------------------------------------------------------------------
    # PÁGINA: CHAT CON CLIENTES (estilo WhatsApp)
    # -------------------------------------------------------------------------
    # Es el MISMO chat de la app móvil (chat.tsx → 13_chat.sql, tabla ChatMensaje):
    # cada cliente le escribe a SU sucursal y aquí lo ve toda la recepción de
    # esa sucursal (cualquier compañero puede contestar).
    #   Izquierda: clientes que han escrito (el más reciente arriba) o, al
    #              buscar, clientes de la sucursal para escribirles primero.
    #   Derecha:   la conversación. Gris = el cliente; verde = la sucursal
    #              (si lo escribió otro compañero, sale su nombre arriba).
    #              ✓ enviado · ✓✓ azul = el cliente ya lo leyó en la app.
    # Mientras esta página está abierta, se revisan mensajes nuevos cada
    # SEGUNDOS_REVISAR_CHAT segundos (la app móvil lo hace cada 4).
    def p_chat(self):
        pagina = self._pagina                   # si cambia, salió del chat: se detienen las revisiones

        def en_chat():
            return self._pagina == pagina and not self._cerrada

        self.title_("Chat con clientes")

        cuerpo = ctk.CTkFrame(self.main, fg_color="transparent")
        cuerpo.pack(fill="both", expand=True)

        # ---------- Panel izquierdo: buscador + lista de chats ----------
        izq = ctk.CTkFrame(cuerpo, fg_color="#111b21", corner_radius=12, width=280)
        izq.pack(side="left", fill="y", padx=(0, 10))
        izq.pack_propagate(False)               # que conserve sus 280 px de ancho
        buscar = ctk.CTkEntry(izq, placeholder_text="🔍  Buscar cliente para escribirle", height=36)
        buscar.pack(fill="x", padx=10, pady=10)
        lista = ctk.CTkScrollableFrame(izq, fg_color="transparent")
        lista.pack(fill="both", expand=True, padx=4, pady=(0, 8))

        # ---------- Panel derecho: conversación ----------
        der = ctk.CTkFrame(cuerpo, fg_color=CHAT_FONDO, corner_radius=12)
        der.pack(side="right", fill="both", expand=True)

        vacio = ctk.CTkLabel(der, text="💬\n\nSelecciona un chat de la izquierda\n"
                                       "o busca a un cliente para escribirle.\n\n"
                                       "Los clientes te escriben desde la app móvil.",
                             text_color=CHAT_HORA, font=("Segoe UI", 15), justify="center")
        vacio.pack(expand=True)

        cabecera = ctk.CTkFrame(der, fg_color="#202c33", corner_radius=12)
        cabecera.columnconfigure(1, weight=1)
        avatar_cab = ctk.CTkLabel(cabecera, text="", width=42, height=42, corner_radius=21,
                                  text_color="white", font=("Segoe UI", 14, "bold"))
        avatar_cab.grid(row=0, column=0, rowspan=2, padx=10, pady=8)
        nombre_cab = ctk.CTkLabel(cabecera, text="", font=("Segoe UI", 15, "bold"), anchor="w")
        nombre_cab.grid(row=0, column=1, sticky="ew", pady=(8, 0))
        detalle_cab = ctk.CTkLabel(cabecera, text="", text_color=CHAT_HORA, anchor="w", font=("Segoe UI", 12))
        detalle_cab.grid(row=1, column=1, sticky="ew", pady=(0, 8))

        mensajes = ctk.CTkScrollableFrame(der, fg_color=CHAT_FONDO)

        escribir = ctk.CTkFrame(der, fg_color="#202c33", corner_radius=12)
        caja = ctk.CTkEntry(escribir, placeholder_text="Escribe un mensaje", height=40,
                            border_width=0, fg_color="#2a3942")
        caja.pack(side="left", fill="x", expand=True, padx=(10, 6), pady=8)
        boton_enviar = ctk.CTkButton(escribir, text="➤", width=46, height=40, corner_radius=20,
                                     font=("Segoe UI", 16), command=lambda: enviar())
        boton_enviar.pack(side="right", padx=(0, 10), pady=8)

        estado = {
            "cliente": None,            # el chat abierto: {"id", "nombre", "detalle"}
            "abriendo": 0,              # sube al abrir otro chat (se ignoran respuestas del anterior)
            "ultimo_id": 0,             # último mensaje recibido de la BD
            "mostrados": set(),         # ids ya dibujados (para no repetir)
            "pendientes": {},           # id -> (etiqueta de hora, mensaje): míos que el cliente no ha leído
            "ultimo_dia": None,         # para poner "Hoy", "Ayer"... al cambiar de día
            "aviso_vacio": None,        # "Aún no hay mensajes"
            "busqueda": "",
            "temporizador_busqueda": None,
            "firma_lista": None,        # para redibujar la lista solo si cambió algo
            "panel_visible": False,     # False = se ve el aviso "Selecciona un chat"
        }

        def color_avatar(id_):
            return COLORES_AVATAR[id_ % len(COLORES_AVATAR)]

        # ---------- Lista de chats ----------
        def de_conversacion(c):
            vista = ("" if c["ultimo_de_cliente"] else "✓ ") + (c["ultimo_texto"] or "")
            return {"id": c["id_cliente"], "nombre": c["cliente"], "vista": vista,
                    "fecha": c["ultima_fecha"], "sin_leer": c["sin_leer"] or 0, "detalle": "Cliente"}

        def de_busqueda(c):
            return {"id": c["id_cliente"], "nombre": c["cliente"], "vista": f"DPI {c['nit_dpi']}",
                    "fecha": None, "sin_leer": 0, "detalle": f"Cliente · DPI {c['nit_dpi']}"}

        def dibujar_lista(items):
            abierto = estado["cliente"]["id"] if estado["cliente"] else None
            firma = (estado["busqueda"], abierto,
                     tuple((c["id"], c["vista"], c["sin_leer"], c["fecha"]) for c in items))
            if firma == estado["firma_lista"]:
                return                          # nada cambió: no se redibuja (evita parpadeo)
            estado["firma_lista"] = firma

            for w in lista.winfo_children():
                w.destroy()
            if not items:
                texto = ("Ningún cliente de esta sucursal coincide." if estado["busqueda"]
                         else "Aún no hay conversaciones.\n\nCuando un cliente escriba desde\n"
                              "la app aparecerá aquí, o búscalo\narriba para escribirle tú.")
                ctk.CTkLabel(lista, text=texto, text_color=CHAT_HORA, justify="center").pack(pady=30)
                return

            for c in items:
                item = ctk.CTkFrame(lista, fg_color="#2a3942" if c["id"] == abierto else "transparent",
                                    corner_radius=8)
                item.pack(fill="x", pady=1)
                item.columnconfigure(1, weight=1)
                partes = [item]

                av = ctk.CTkLabel(item, text=iniciales(c["nombre"]), width=42, height=42, corner_radius=21,
                                  fg_color=color_avatar(c["id"]), text_color="white",
                                  font=("Segoe UI", 14, "bold"))
                av.grid(row=0, column=0, rowspan=2, padx=8, pady=6)
                nom = ctk.CTkLabel(item, text=recortar(c["nombre"], 22), font=("Segoe UI", 13, "bold"), anchor="w")
                nom.grid(row=0, column=1, sticky="ew", pady=(6, 0))
                hora = ctk.CTkLabel(item, text=fecha_lista_chat(c["fecha"]), font=("Segoe UI", 11),
                                    text_color="#25d366" if c["sin_leer"] else CHAT_HORA)
                hora.grid(row=0, column=2, padx=8, pady=(6, 0), sticky="e")
                sub = ctk.CTkLabel(item, text=recortar(c["vista"], 28), text_color=CHAT_HORA, anchor="w",
                                   font=("Segoe UI", 12))
                sub.grid(row=1, column=1, sticky="ew", pady=(0, 6))
                partes += [av, nom, hora, sub]
                if c["sin_leer"]:
                    globito = ctk.CTkLabel(item, text=str(c["sin_leer"]), width=22, height=22, corner_radius=11,
                                           fg_color="#25d366", text_color="#111b21", font=("Segoe UI", 11, "bold"))
                    globito.grid(row=1, column=2, padx=8, pady=(0, 6))
                    partes.append(globito)

                for w in partes:                # clic en cualquier parte del renglón abre el chat
                    w.bind("<Button-1>", lambda e, c=c: abrir(c))

        def cargar_lista(forzar=False):
            texto = estado["busqueda"]

            def mostrar(items):
                if en_chat() and texto == estado["busqueda"]:
                    dibujar_lista(items)

            if texto:
                trabajo = lambda: [de_busqueda(c) for c in bd.chat_buscar_clientes(texto)]
            else:
                trabajo = lambda: [de_conversacion(c) for c in bd.chat_conversaciones()]
            if forzar:                          # búsqueda o envío: siempre
                self.en_segundo_plano(trabajo, mostrar, al_fallar=lambda m: print("[chat]", m))
            else:                               # revisión automática: se salta si la anterior no ha terminado
                self.revisar("chat_lista", trabajo, mostrar)

        def ciclo_lista():
            if en_chat():
                cargar_lista()
                self.programar(SEGUNDOS_REVISAR_CONTACTOS * 1000, ciclo_lista)

        # Buscar: espera a que deje de escribir 0.4 s para no consultar en cada tecla
        def al_escribir(_=None):
            self.cancelar(estado["temporizador_busqueda"])
            estado["temporizador_busqueda"] = self.programar(400, aplicar_busqueda)

        def aplicar_busqueda():
            estado["temporizador_busqueda"] = None
            nuevo = buscar.get().strip()
            if nuevo != estado["busqueda"]:
                estado["busqueda"] = nuevo
                cargar_lista(forzar=True)
        buscar.bind("<KeyRelease>", al_escribir)

        # ---------- Conversación ----------
        def bajar_al_final():
            def bajar():
                try:
                    mensajes.update_idletasks()
                    mensajes._parent_canvas.yview_moveto(1.0)   # lienzo interno del CTkScrollableFrame
                except (AttributeError, tk.TclError):
                    pass
            self.programar(30, bajar)

        def texto_pie(m):
            if m["de_cliente"]:
                return hora_corta(m["fecha"])
            return hora_corta(m["fecha"]) + ("  ✓✓" if m["leido"] else "  ✓")

        def burbuja(m):
            de_sucursal = not m["de_cliente"]
            fila = ctk.CTkFrame(mensajes, fg_color="transparent")
            fila.pack(fill="x", padx=8, pady=2)
            globo = ctk.CTkFrame(fila, fg_color=CHAT_MIO if de_sucursal else CHAT_OTRO, corner_radius=10)
            globo.pack(side="right" if de_sucursal else "left", padx=(80, 0) if de_sucursal else (0, 80))
            # Si lo contestó otro compañero de la sucursal, se ve su nombre arriba
            if de_sucursal and m.get("autor") and m["autor"] != self.usuario:
                ctk.CTkLabel(globo, text=m["autor"], font=("Segoe UI", 11, "bold"),
                             text_color="#53bdeb").pack(padx=10, pady=(6, 0), anchor="w")
            ctk.CTkLabel(globo, text=m["texto"], wraplength=360, justify="left", anchor="w",
                         text_color="#e9edef", font=("Segoe UI", 13)).pack(padx=10, pady=(6, 0), anchor="w")
            pie = ctk.CTkLabel(globo, text=texto_pie(m), font=("Segoe UI", 10),
                               text_color=CHAT_LEIDO if (de_sucursal and m["leido"]) else CHAT_HORA)
            pie.pack(padx=10, pady=(0, 4), anchor="e")
            if de_sucursal and not m["leido"]:
                estado["pendientes"][m["id_mensaje"]] = (pie, m)

        def marcar_leido(id_mensaje):
            pie, m = estado["pendientes"].pop(id_mensaje)
            m["leido"] = True
            pie.configure(text=texto_pie(m), text_color=CHAT_LEIDO)

        def agregar(nuevos, desde_bd=True):
            hubo = False
            for m in nuevos:
                id_ = m["id_mensaje"]
                if desde_bd:
                    # El último id solo avanza con lo que llega de la BD, así no se pierde
                    # un mensaje que el cliente mandó justo mientras yo enviaba el mío
                    estado["ultimo_id"] = max(estado["ultimo_id"], id_)
                if id_ in estado["mostrados"]:
                    if m["leido"] and id_ in estado["pendientes"]:
                        marcar_leido(id_)       # ✓ → ✓✓ azul: el cliente ya lo vio
                    continue
                if estado["aviso_vacio"] is not None:
                    estado["aviso_vacio"].destroy()
                    estado["aviso_vacio"] = None
                estado["mostrados"].add(id_)

                dia = m["fecha"].date()
                if dia != estado["ultimo_dia"]:          # separador "Hoy", "Ayer", "19/10/2026"
                    estado["ultimo_dia"] = dia
                    ctk.CTkLabel(mensajes, text=f"  {dia_chat(dia)}  ", fg_color="#182229", corner_radius=8,
                                 text_color=CHAT_HORA, font=("Segoe UI", 11)).pack(pady=8)
                burbuja(m)
                hubo = True
            if hubo:
                bajar_al_final()

        # Desde dónde preguntar: lo último recibido, o antes si algún mensaje mío
        # sigue sin leer (para enterarse cuando el cliente lo lea). Igual que chat.tsx.
        def desde():
            return min([estado["ultimo_id"]] + [i - 1 for i in estado["pendientes"]])

        def traer_mensajes(primera=False):
            c = estado["cliente"]
            if c is None or not en_chat():
                return
            numero = estado["abriendo"]
            despues = 0 if primera else desde()

            def mostrar(nuevos):
                if numero != estado["abriendo"] or not en_chat():
                    return                      # mientras tanto se abrió otro chat
                if primera:
                    for w in mensajes.winfo_children():
                        w.destroy()             # quita "Cargando…"
                    if not nuevos and not estado["mostrados"]:
                        estado["aviso_vacio"] = ctk.CTkLabel(
                            mensajes, text="Aún no hay mensajes con este cliente.\n¡Escríbele el primero! 👋",
                            text_color=CHAT_HORA, justify="center")
                        estado["aviso_vacio"].pack(pady=30)
                ya = set(estado["mostrados"])
                agregar(nuevos)
                if primera or any(m["de_cliente"] and m["id_mensaje"] not in ya for m in nuevos):
                    cargar_lista(forzar=True)   # sus "sin leer" ya bajaron a 0
                    self.actualizar_aviso_chat()

            trabajo = lambda: bd.chat_mensajes(c["id"], despues)
            if primera:
                def fallo(mensaje):
                    if numero == estado["abriendo"] and en_chat():
                        for w in mensajes.winfo_children():
                            w.destroy()
                        ctk.CTkLabel(mensajes, text=f"No se pudieron cargar los mensajes:\n{mensaje}",
                                     text_color="#f87171", justify="center").pack(pady=30)
                self.en_segundo_plano(trabajo, mostrar, al_fallar=fallo)
            else:
                self.revisar("chat_mensajes", trabajo, mostrar)

        def ciclo_mensajes():
            if en_chat():
                traer_mensajes()
                self.programar(SEGUNDOS_REVISAR_CHAT * 1000, ciclo_mensajes)

        def abrir(c):
            estado["abriendo"] += 1
            estado.update(cliente=c, ultimo_id=0, ultimo_dia=None, aviso_vacio=None)
            estado["mostrados"] = set()
            estado["pendientes"] = {}

            if not estado["panel_visible"]:     # la primera vez: cambiar el aviso por la conversación
                estado["panel_visible"] = True
                vacio.pack_forget()
                cabecera.pack(fill="x", padx=8, pady=(8, 0))
                escribir.pack(side="bottom", fill="x", padx=8, pady=8)
                mensajes.pack(fill="both", expand=True, padx=4, pady=(4, 0))

            avatar_cab.configure(text=iniciales(c["nombre"]), fg_color=color_avatar(c["id"]))
            nombre_cab.configure(text=c["nombre"])
            detalle_cab.configure(text=f"{c['detalle']} · escribe desde la app móvil")
            for w in mensajes.winfo_children():
                w.destroy()
            ctk.CTkLabel(mensajes, text="Cargando mensajes…", text_color=CHAT_HORA).pack(pady=30)

            # Si lo encontró buscando, se limpia la búsqueda y se vuelve a la lista de chats
            if estado["busqueda"]:
                buscar.delete(0, "end")
                estado["busqueda"] = ""
            estado["firma_lista"] = None        # para resaltar el chat abierto
            cargar_lista(forzar=True)

            caja.focus()
            traer_mensajes(primera=True)

        def enviar():
            c = estado["cliente"]
            texto = caja.get().strip()
            if c is None or not texto or boton_enviar.cget("state") == "disabled":
                return
            if len(texto) > bd.LARGO_MAXIMO_MENSAJE:
                return messagebox.showwarning("Chat", f"El mensaje es muy largo (máximo "
                                                      f"{bd.LARGO_MAXIMO_MENSAJE} caracteres).")
            caja.delete(0, "end")
            numero = estado["abriendo"]

            def listo(id_mensaje):
                if numero == estado["abriendo"] and en_chat():
                    agregar([{"id_mensaje": id_mensaje, "texto": texto, "fecha": datetime.now(),
                              "de_cliente": False, "leido": False, "autor": self.usuario}], desde_bd=False)
                    cargar_lista(forzar=True)   # el chat sube al primer lugar

            def fallo(mensaje):
                if numero == estado["abriendo"] and en_chat() and not caja.get():
                    caja.insert(0, texto)       # se le devuelve lo que escribió
                messagebox.showwarning("Chat", f"No se pudo enviar el mensaje:\n{mensaje}")

            self.en_segundo_plano(lambda: bd.chat_enviar(c["id"], texto),
                                  listo, al_fallar=fallo, boton=boton_enviar)

        caja.bind("<Return>", lambda e: enviar())

        # Arranque: lista de chats y revisiones automáticas
        cargar_lista(forzar=True)
        self.programar(SEGUNDOS_REVISAR_CONTACTOS * 1000, ciclo_lista)
        self.programar(SEGUNDOS_REVISAR_CHAT * 1000, ciclo_mensajes)


# =============================================================================
# PUNTO DE ENTRADA DEL PROGRAMA
# =============================================================================
# Login -> App -> (Cerrar sesión) -> Login ... hasta que se cierre una ventana con la X.
if __name__ == "__main__":
    try:
        while True:
            login = Login()
            login.mainloop()
            if login.empleado is None:      # cerró el login sin entrar
                break
            app = App(login.empleado)
            app.mainloop()
            if not app.cerrar_sesion:       # cerró la ventana principal con la X
                break
    finally:
        bd.cerrar()
