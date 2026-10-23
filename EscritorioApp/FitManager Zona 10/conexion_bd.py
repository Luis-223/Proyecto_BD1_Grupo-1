# conexion_bd.py — CONEXIÓN DE LA APP DE ESCRITORIO (PRINCIPAL.py) CON EL SERVIDOR DE FITMANAGER
#
# Aquí vive TODO lo que habla con el servidor. PRINCIPAL.py solo dibuja
# ventanas y llama a las funciones de abajo (resumen, facturar_membresia, chat_enviar...).
#
#   PRINCIPAL.py  ->  conexion_bd.py  --HTTPS-->  servidor Node (VM de Azure)  -->  Azure SQL
#
# Cómo funciona:
#   - La app YA NO se conecta a la base de datos: no necesita pyodbc, ni el driver
#     ODBC, ni la contraseña de la base, ni agregar su IP al firewall de Azure SQL.
#     Solo necesita internet y la dirección del servidor.
#   - Los datos salen de "escritorio.env" (junto a este archivo, NUNCA se sube a GitHub):
#     SERVIDOR_URL e ID_SUCURSAL.
#   - Al iniciar sesión el servidor revisa usuario y contraseña (Argon2, igual que la
#     app móvil) y devuelve un token. Después cada petición lo manda en el encabezado
#     Authorization. La sucursal y el empleado SIEMPRE los toma el servidor del token.
#   - Las rutas están en servidor/rutas/escritorio.js.
#   - Los errores del servidor traen un mensaje claro ("La clase ya no tiene cupo.")
#     y se muestran tal cual.

import os
import re
import threading
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

CARPETA = Path(__file__).resolve().parent
load_dotenv(CARPETA / "escritorio.env")


class ErrorBD(Exception):
    """Error con un mensaje listo para mostrarle al usuario."""


# =============================================================================
# CONFIGURACIÓN
# =============================================================================
SEGUNDOS_PARA_CONECTAR = 15    # llegar al servidor
SEGUNDOS_DE_RESPUESTA = 75     # la base gratuita de Azure "se duerme" y tarda hasta 1 minuto en despertar
LARGO_MAXIMO_MENSAJE = 1000
LARGO_MAXIMO_CONTRASENA = 100

# Claves cuyo valor es texto libre: nunca se convierten en fecha aunque se parezcan a una
_CLAVES_DE_TEXTO = {"texto", "ultimo_texto", "motivo", "nombre", "cliente", "autor"}
_FECHA = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def _servidor():
    return os.getenv("SERVIDOR_URL", "").strip().rstrip("/")


def _es_local(direccion):
    host = (urlparse(direccion).hostname or "").lower()
    return host in ("localhost", "127.0.0.1", "::1") or host.startswith(("192.168.", "10."))


def revisar_configuracion():
    """Devuelve una lista de problemas en escritorio.env (vacía si todo está bien)."""
    problemas = []
    if not (CARPETA / "escritorio.env").exists():
        problemas.append("No existe el archivo escritorio.env (copia escritorio.env.ejemplo y llénalo).")

    servidor = _servidor()
    if not servidor:
        problemas.append("Falta SERVIDOR_URL en escritorio.env (la dirección del servidor, "
                         "ej: https://api.tudominio.com).")
    elif not re.match(r"https?://[^/\s]+", servidor):
        problemas.append("SERVIDOR_URL debe empezar con https:// (ej: https://api.tudominio.com).")
    elif servidor.lower().startswith("http://") and not _es_local(servidor) \
            and os.getenv("PERMITIR_HTTP", "").strip().lower() != "true":
        problemas.append("SERVIDOR_URL usa http:// y la contraseña viajaría sin cifrar. Usa https:// "
                         "(o PERMITIR_HTTP=true solo para pruebas).")

    if not os.getenv("ID_SUCURSAL"):
        problemas.append("Falta ID_SUCURSAL en escritorio.env.")
    elif not os.getenv("ID_SUCURSAL").strip().isdigit():
        problemas.append("ID_SUCURSAL debe ser un número (el id_sucursal de esta sucursal).")
    return problemas


def id_sucursal_configurada():
    return int(os.getenv("ID_SUCURSAL", "0").strip() or 0)


# =============================================================================
# PETICIONES AL SERVIDOR
# =============================================================================
_sesion = requests.Session()
_candado = threading.Lock()      # protege el token (la ventana usa varios hilos)
_token = None


def _verificar_certificado():
    return os.getenv("VERIFICAR_SSL", "true").strip().lower() != "false"


def _convertir_fechas(valor, clave=None):
    """Las fechas llegan como 'AAAA-MM-DDTHH:MM:SS' (misma hora que la base): se vuelven datetime."""
    if isinstance(valor, str):
        if clave not in _CLAVES_DE_TEXTO and _FECHA.fullmatch(valor):
            return datetime.fromisoformat(valor)
        return valor
    if isinstance(valor, list):
        return [_convertir_fechas(v) for v in valor]
    if isinstance(valor, dict):
        return {k: _convertir_fechas(v, k) for k, v in valor.items()}
    return valor


def _error_de_respuesta(respuesta):
    """Mensaje para el usuario a partir de una respuesta 4xx/5xx del servidor."""
    try:
        mensaje = respuesta.json().get("error")
    except ValueError:
        mensaje = None

    if respuesta.status_code == 401 and _token:
        return ErrorBD(mensaje or "La sesión expiró. Cierra la app e inicia sesión otra vez.")
    if respuesta.status_code in (502, 503, 504):
        return ErrorBD("El servidor no está disponible en este momento (o la base se está iniciando). "
                       "Espera un minuto e intenta de nuevo.")
    if respuesta.status_code == 404 and not mensaje:
        return ErrorBD("El servidor no tiene esa ruta. Falta actualizar el servidor con rutas/escritorio.js "
                       "(y reiniciarlo).")
    if respuesta.status_code == 404 and mensaje and mensaje.startswith("No existe la ruta"):
        return ErrorBD("El servidor todavía no tiene las rutas de escritorio. Agrega rutas/escritorio.js y "
                       "la línea app.use('/escritorio', ...) en server.js, y reinícialo.")
    return ErrorBD(mensaje or f"El servidor respondió con un error ({respuesta.status_code}).")


def _pedir(metodo, ruta, cuerpo=None, parametros=None, reintentar=False, con_token=True):
    """Hace una petición y devuelve el JSON de la respuesta, o lanza ErrorBD.

    reintentar=True: si no se pudo llegar al servidor se intenta UNA vez más. Solo se usa en
    consultas (GET); en cobros, ventas y mensajes es False para no hacerlos dos veces.
    """
    problemas = revisar_configuracion()
    if problemas:
        raise ErrorBD("\n".join(problemas))

    encabezados = {}
    with _candado:
        token = _token
    if con_token:
        if not token:
            raise ErrorBD("Debes iniciar sesión.")
        encabezados["Authorization"] = f"Bearer {token}"

    for intento in (1, 2):
        try:
            respuesta = _sesion.request(
                metodo, _servidor() + ruta, json=cuerpo, params=parametros, headers=encabezados,
                timeout=(SEGUNDOS_PARA_CONECTAR, SEGUNDOS_DE_RESPUESTA), verify=_verificar_certificado())
        except requests.exceptions.SSLError as error:
            print("[Servidor] Error SSL:", error)
            raise ErrorBD("No se pudo verificar el certificado HTTPS del servidor. Revisa que SERVIDOR_URL "
                          "use el dominio del certificado (no la IP).") from None
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as error:
            if reintentar and intento == 1:
                continue
            print("[Servidor] Sin conexión:", error)
            raise ErrorBD("No se pudo conectar con el servidor. Revisa el internet y SERVIDOR_URL en "
                          "escritorio.env, e intenta de nuevo.") from None
        except requests.exceptions.RequestException as error:
            print("[Servidor] Error:", error)
            raise ErrorBD("Ocurrió un error al comunicarse con el servidor. El detalle está en la terminal.") from None

        if respuesta.status_code >= 400:
            raise _error_de_respuesta(respuesta)
        try:
            return respuesta.json()
        except ValueError:
            raise ErrorBD("El servidor respondió algo que no se entiende. Revisa que SERVIDOR_URL apunte "
                          "al servidor de FitManager.") from None


def _tablas(metodo, ruta, cuerpo=None, parametros=None, reintentar=False):
    """Pide algo a /escritorio y devuelve la lista de tablas (como los recordsets del procedimiento)."""
    datos = _pedir(metodo, "/escritorio" + ruta, cuerpo, parametros, reintentar)
    return _convertir_fechas(datos.get("tablas", []))


def _ultima_tabla(tablas):
    """El resultado final del procedimiento."""
    return tablas[-1] if tablas else []


def _primera_fila(tablas):
    filas = _ultima_tabla(tablas)
    if not filas:
        raise ErrorBD("El servidor no devolvió datos.")
    return filas[0]


def cerrar():
    global _token
    with _candado:
        _token = None
    _sesion.close()


# =============================================================================
# INICIO DE SESIÓN
# =============================================================================
def iniciar_sesion(alias, contrasena):
    """Revisa usuario y contraseña en el servidor. Devuelve los datos del empleado o lanza ErrorBD.

    {"id_alias", "alias", "id_usuario", "nombre", "estado", "roles", "id_sucursal", "sucursal"}
    """
    global _token
    alias = (alias or "").strip()
    contrasena = contrasena or ""
    if not alias or not contrasena:
        raise ErrorBD("Escribe tu usuario y tu contraseña.")
    if len(contrasena) > LARGO_MAXIMO_CONTRASENA:
        raise ErrorBD("Usuario o contraseña incorrectos.")

    datos = _pedir("POST", "/escritorio/login", con_token=False, cuerpo={
        "alias": alias, "contrasena": contrasena, "id_sucursal": id_sucursal_configurada()})
    if not datos.get("token") or not datos.get("usuario"):
        raise ErrorBD("El servidor no devolvió la sesión. Revisa que sea el servidor de FitManager.")
    with _candado:
        _token = datos["token"]
    return datos["usuario"]


# =============================================================================
# FUNCIONES QUE USA CADA PÁGINA DE PRINCIPAL.py
# =============================================================================
def actualizar_membresias_vencidas():
    """Pasa a 'Vencida' las membresías cuya fecha ya terminó (al abrir la app)."""
    _tablas("POST", "/membresias/actualizar")


def resumen():
    return _primera_fila(_tablas("GET", "/resumen", reintentar=True))


def catalogos():
    clientes, tipos, metodos, entrenadores = _tablas("GET", "/catalogos", reintentar=True)
    return {"clientes": clientes, "tipos": tipos, "metodos": metodos, "entrenadores": entrenadores}


def listar_facturas(cantidad=100):
    return _ultima_tabla(_tablas("GET", "/facturas", parametros={"cantidad": cantidad}, reintentar=True))


def facturar_membresia(id_cliente, id_tipo_membresia, id_metodo_pago, meses):
    return _primera_fila(_tablas("POST", "/facturas/membresia", {
        "id_cliente": id_cliente, "id_tipo_membresia": id_tipo_membresia,
        "id_metodo_pago": id_metodo_pago, "meses": meses}))


def listar_clases():
    return _ultima_tabla(_tablas("GET", "/clases", reintentar=True))


def cambiar_horario(id_clase, nueva_fecha_hora, motivo):
    """nueva_fecha_hora: datetime con la hora que debe quedar en la base."""
    return _primera_fila(_tablas("PUT", f"/clases/{int(id_clase)}/horario", {
        "nueva_fecha_hora": nueva_fecha_hora.strftime("%Y-%m-%d %H:%M:%S"), "motivo": motivo or None}))


def listar_asignaciones():
    return _ultima_tabla(_tablas("GET", "/asignaciones", reintentar=True))


def cambiar_entrenador(id_cliente, id_entrenador, motivo):
    """Agrega el entrenador al cliente (07_entrenadores.sql: sin quitar los que ya tiene)."""
    return _primera_fila(_tablas("POST", "/entrenadores/agregar", {
        "id_cliente": id_cliente, "id_entrenador": id_entrenador, "motivo": motivo or None}))


def quitar_entrenador(id_cliente, id_entrenador):
    """Cierra la asignación de ese entrenador (el cliente puede tener varios)."""
    return _primera_fila(_tablas("POST", "/entrenadores/quitar", {
        "id_cliente": id_cliente, "id_entrenador": id_entrenador}))


def listar_productos():
    return _ultima_tabla(_tablas("GET", "/productos", reintentar=True))


def vender_productos(id_cliente, id_metodo_pago, carrito):
    """carrito: {id_producto: cantidad}"""
    productos = [{"id_producto": int(i), "cantidad": int(c)} for i, c in carrito.items()]
    return _primera_fila(_tablas("POST", "/ventas", {
        "id_cliente": id_cliente, "id_metodo_pago": id_metodo_pago, "productos": productos}))


def detalle_factura(id_factura):
    """Todo lo que lleva el PDF: {"factura": {...}, "lineas": [...], "pagos": [...]}"""
    tablas = _tablas("GET", f"/facturas/{int(id_factura)}", reintentar=True)
    if len(tablas) < 3 or not tablas[0]:
        raise ErrorBD("No se encontraron los datos de la factura.")
    return {"factura": tablas[0][0], "lineas": tablas[1], "pagos": tablas[2]}


# =============================================================================
# CHAT CON CLIENTES — el MISMO chat de la app móvil (chat.tsx), tabla ChatMensaje (13_chat.sql):
#   el cliente le escribe a SU sucursal y la recepción contesta desde aquí.
# Las fechas ya vienen en hora de Guatemala.
# =============================================================================
def chat_conversaciones():
    """Clientes que le han escrito a la sucursal (el más reciente primero):
    id_cliente, cliente, ultimo_texto, ultimo_de_cliente, ultima_fecha, sin_leer"""
    return _ultima_tabla(_tablas("GET", "/chat/conversaciones", reintentar=True))


def chat_buscar_clientes(buscar):
    """Clientes de la sucursal cuyo nombre, alias o DPI coincide (para empezar un chat)."""
    return _ultima_tabla(_tablas("GET", "/chat/clientes", parametros={"buscar": buscar}, reintentar=True))


def chat_mensajes(id_cliente, despues=0):
    """Mensajes con id mayor a 'despues' (y marca como leídos los del cliente):
    id_mensaje, texto, fecha, de_cliente, leido, autor"""
    return _ultima_tabla(_tablas("GET", f"/chat/{int(id_cliente)}/mensajes",
                                 parametros={"despues": despues}, reintentar=True))


def chat_enviar(id_cliente, texto):
    """Devuelve el id_mensaje nuevo."""
    texto = (texto or "").strip()
    if not texto:
        raise ErrorBD("Escribe un mensaje.")
    if len(texto) > LARGO_MAXIMO_MENSAJE:
        raise ErrorBD(f"El mensaje es muy largo (máximo {LARGO_MAXIMO_MENSAJE} caracteres).")
    # Sin reintento: si la conexión se cae a medio envío, no se manda dos veces
    fila = _primera_fila(_tablas("POST", f"/chat/{int(id_cliente)}/mensajes", {"texto": texto}))
    return fila["id_mensaje"]


def chat_sin_leer():
    """Mensajes de clientes que la sucursal no ha leído (número del menú)."""
    return _primera_fila(_tablas("GET", "/chat/sin-leer", reintentar=True))["sin_leer"]
