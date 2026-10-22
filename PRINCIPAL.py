import queue                                # Cola para pasar resultados del hilo de la BD a la ventana
import threading                            # Hilos: la BD trabaja aparte y la ventana no se congela
import tkinter as tk
from datetime import datetime               # Para validar la nueva fecha y hora de una clase
from tkinter import ttk, messagebox         # Tablas y ventanas emergentes de aviso

import customtkinter as ctk                 # Librería de interfaz moderna

import conexion_bd as bd                    # TODO lo que habla con SQL Server está en conexion_bd.py

# ------------------------- CONFIGURACIÓN GLOBAL ------------------------------
ctk.set_appearance_mode("dark")             # Modo oscuro
ctk.set_default_color_theme("green")        # Tema de color por defecto de los widgets (botones)

ACCENT = "#22c55e"                          # Color de verde usado en títulos, números y selección
CARD = "#1f2937"                            # Color de fondo de las "tarjetas" (gris oscuro)


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
        self._revision = self.after(50, self._revisar_cola)

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
        try:
            self.after_cancel(self._revision)
        except (tk.TclError, ValueError):
            pass
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
            except bd.ErrorBD as error:
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

        # Revisa usuario y contraseña en la BD (Argon2, igual que la app móvil)
        self.en_segundo_plano(lambda: bd.iniciar_sesion(usuario, contrasena),
                              correcto, al_fallar=incorrecto, boton=self.boton)


# =============================================================================
# VENTANA PRINCIPAL
# =============================================================================
class App(Ventana):
    def __init__(self, empleado):
        super().__init__()
        self.title(f"FitManager - {empleado['sucursal']}")
        self.geometry("1100x680")           # Tamaño inicial
        self.minsize(980, 600)              # Tamaño mínimo permitido al redimensionar

        # Datos de quien inició sesión (vienen de usp_Escritorio_DatosEmpleado)
        self.usuario = empleado["nombre"]
        self.id_usuario = empleado["id_usuario"]       # queda guardado en facturas y cambios
        self.id_sucursal = empleado["id_sucursal"]     # sale de ID_SUCURSAL en escritorio.env
        self.cerrar_sesion = False                     # True si se pulsa "Cerrar sesión"

        # ---------- Barra lateral (menú izquierdo) ----------
        side = ctk.CTkFrame(self, width=210, corner_radius=0, fg_color="#0b1220")
        side.pack(side="left", fill="y")    # Pegada a la izquierda, ocupa todo el alto
        ctk.CTkLabel(side, text="🏋️ FitManager", font=("Segoe UI", 20, "bold"),
                     text_color=ACCENT).pack(pady=(25, 0))
        ctk.CTkLabel(side, text=empleado["sucursal"], text_color="gray").pack(pady=(0, 20))

        # ---------- Área principal (derecha) ----------
        # Aquí se dibuja el contenido de cada página; se limpia y rellena al cambiar de menú
        self.main = ctk.CTkFrame(self, fg_color="transparent")
        self.main.pack(side="right", fill="both", expand=True, padx=20, pady=15)

        # Diccionario: texto del botón del menú -> función que dibuja la página
        self.pages = {"🏠  Inicio": self.p_inicio, "🧾  Facturación": self.p_factura,
                      "🕒  Cambio de horario": self.p_horario,
                      "🧑‍🏫  Cambio de entrenador": self.p_entrenador,
                      "🛒  Venta de productos": self.p_productos}

        # Crea un botón en el menú por cada página
        for name, fn in self.pages.items():
            # "lambda f=fn" fija la función de esta iteración
            ctk.CTkButton(side, text=name, anchor="w", height=42, fg_color="transparent",
                          hover_color="#1f2937", command=lambda f=fn: self.show(f)).pack(fill="x", padx=12, pady=3)

        # Parte inferior del menú: nombre del usuario y botón de cerrar sesión
        ctk.CTkLabel(side, text=f"👤 {self.usuario}", text_color="gray").pack(side="bottom", pady=(0, 10))
        ctk.CTkButton(side, text="Cerrar sesión", fg_color="#7f1d1d", hover_color="#991b1b",
                      command=self.salir).pack(side="bottom", padx=12, pady=5, fill="x")

        # Al abrir la app: las membresías que ya terminaron pasan a 'Vencida'
        self.en_segundo_plano(bd.actualizar_membresias_vencidas, silencioso=True)

        # Al abrir la app se muestra la página de inicio
        self.show(self.p_inicio)

    # Cierra la sesión: PRINCIPAL vuelve a abrir el login
    def salir(self):
        self.cerrar_sesion = True
        self.destroy()

    # Cambia de página: borra todo lo que hay en el área principal y dibuja la nueva
    def show(self, fn):
        for w in self.main.winfo_children():    # Recorre todos los widgets actuales
            w.destroy()                         # Los elimina
        fn()                                    # Ejecuta el método que dibuja la nueva página

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

        self.en_segundo_plano(lambda: bd.resumen(self.id_sucursal), mostrar)   # usp_Escritorio_Resumen

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
        tabla.pack(fill="both", expand=True, pady=10)

        def mostrar_facturas(filas):
            llenar_tabla(tabla, [(r["id_factura"], (r["numero"], r["cliente"], r["concepto"], r["metodo"],
                                                    dinero(r["total"]), fecha_hora(r["fecha_emision"])))
                                 for r in filas])

        def recargar_facturas():
            self.en_segundo_plano(lambda: bd.listar_facturas(self.id_sucursal), mostrar_facturas)

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

        self.en_segundo_plano(lambda: (bd.catalogos(self.id_sucursal), bd.listar_facturas(self.id_sucursal)),
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
                                    f"al {fecha(r['vigente_hasta'])}.")
                recargar_facturas()

            # usp_Escritorio_FacturarMembresia: Membresia + Factura + Detalle + Pago en una transacción
            self.en_segundo_plano(lambda: bd.facturar_membresia(id_cliente, t["id_tipo_membresia"], id_metodo,
                                                                n, self.id_sucursal, self.id_usuario),
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
            self.en_segundo_plano(lambda: bd.listar_clases(self.id_sucursal), mostrar)

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
            self.en_segundo_plano(lambda: bd.cambiar_horario(clase["id_clase"], self.id_sucursal, nueva,
                                                             motivo.get().strip(), self.id_usuario),
                                  listo, boton=boton)

        recargar()

    # -------------------------------------------------------------------------
    # PÁGINA: CAMBIO DE ENTRENADOR
    # -------------------------------------------------------------------------
    def p_entrenador(self):
        self.title_("Cambio de entrenador")

        # Tabla con cada cliente de la sucursal y su entrenador actual
        tabla = make_table(self.main, ("Cliente", "Entrenador actual", "Desde"), height=10)
        tabla.pack(fill="x")

        # Panel inferior para elegir el nuevo entrenador
        f = self.card()
        ctk.CTkLabel(f, text="Nuevo entrenador").pack(side="left", padx=12, pady=15)
        nuevo = ctk.CTkComboBox(f, values=[], width=200, state="readonly")
        nuevo.pack(side="left", padx=5)
        ctk.CTkLabel(f, text="Motivo").pack(side="left", padx=(12, 5))
        motivo = ctk.CTkEntry(f, width=200, placeholder_text="(opcional)")
        motivo.pack(side="left", padx=5)
        boton = ctk.CTkButton(f, text="Asignar", command=lambda: cambiar())
        boton.pack(side="left", padx=10)

        entrenadores = {}                           # nombre visible -> id_entrenador
        clientes = {}                               # id_cliente -> fila

        def mostrar_tabla(filas):
            clientes.clear()
            clientes.update({r["id_cliente"]: r for r in filas})
            llenar_tabla(tabla, [(r["id_cliente"], (r["cliente"], r["entrenador"], fecha(r["fecha_asignacion"])))
                                 for r in filas])

        def mostrar_todo(resultado):
            cat, asignaciones = resultado
            entrenadores.clear()
            for e in cat["entrenadores"]:
                visible = e["nombre"] + (f" ({e['especialidad']})" if e["especialidad"] else "")
                entrenadores[visible] = e["id_entrenador"]
            llenar_combo(nuevo, entrenadores)
            mostrar_tabla(asignaciones)

        self.en_segundo_plano(lambda: (bd.catalogos(self.id_sucursal), bd.listar_asignaciones(self.id_sucursal)),
                              mostrar_todo)

        # Acción del botón "Asignar"
        def cambiar():
            sel = tabla.selection()             # Fila (cliente) seleccionada
            id_entrenador = entrenadores.get(nuevo.get())
            if not sel or id_entrenador is None:
                return messagebox.showwarning("Aviso", "Selecciona un cliente y el nuevo entrenador.")
            cliente = clientes[int(sel[0])]

            def listo(_):
                messagebox.showinfo("Entrenador", f"{nuevo.get()} es ahora el entrenador de {cliente['cliente']}.")
                self.en_segundo_plano(lambda: bd.listar_asignaciones(self.id_sucursal), mostrar_tabla)

            # usp_Escritorio_CambiarEntrenador: cierra la asignación actual y crea la nueva
            self.en_segundo_plano(lambda: bd.cambiar_entrenador(cliente["id_cliente"], id_entrenador,
                                                                motivo.get().strip(), self.id_usuario),
                                  listo, boton=boton)

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

        self.en_segundo_plano(lambda: (bd.catalogos(self.id_sucursal), bd.listar_productos(self.id_sucursal)),
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
                messagebox.showinfo("Venta", f"Venta registrada. Factura N° {r['id_factura']} por {dinero(r['total'])}.")
                carrito.clear()
                # Recarga el catálogo para ver las existencias nuevas
                self.en_segundo_plano(lambda: bd.listar_productos(self.id_sucursal), dibujar_catalogo)

            # usp_Escritorio_VenderProductos: Factura + Detalle + inventario + Pago en una transacción
            self.en_segundo_plano(lambda: bd.vender_productos(id_cliente, self.id_sucursal, id_metodo,
                                                              self.id_usuario, dict(carrito)),
                                  listo, boton=boton_cobrar)


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