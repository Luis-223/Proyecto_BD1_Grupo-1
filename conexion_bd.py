# conexion_bd.py — CONEXIÓN DE LA APP DE ESCRITORIO (PRINCIPAL.py) CON SQL SERVER
#
# Aquí vive TODO lo que habla con la base de datos. PRINCIPAL.py solo
# dibuja ventanas y llama a las funciones de abajo.
#
# Cómo funciona:
#   - Los datos de conexión salen de "escritorio.env" (junto a este
#     archivo, NUNCA se sube a GitHub). Son los mismos nombres que usa
#     el .env del servidor Node: DB_SERVER, DB_NAME, DB_USER...
#   - La app NO escribe directo en las tablas: solo ejecuta
#     procedimientos almacenados (servidor/sql/06_app_escritorio.sql).
#     Así su usuario de base solo necesita permiso EXECUTE.
#   - Las contraseñas están guardadas con Argon2id (las guarda el
#     servidor Node). Aquí se comparan con la misma configuración, así
#     que un empleado usa la misma contraseña en la app y en el escritorio.
#   - Los errores que lanzan los procedimientos con THROW 50000+ traen
#     un mensaje claro ("La clase ya no tiene cupo."): se muestran tal cual.

import json
import os
import re
import threading
import time
from pathlib import Path

import pyodbc
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from dotenv import load_dotenv

CARPETA = Path(__file__).resolve().parent
load_dotenv(CARPETA / "escritorio.env")


class ErrorBD(Exception):
    """Error con un mensaje listo para mostrarle al usuario."""


# =============================================================================
# CONFIGURACIÓN
# =============================================================================
SEGUNDOS_PARA_CONECTAR = 60   # la base gratuita de Azure "se duerme" y tarda hasta 1 minuto en despertar
SEGUNDOS_POR_CONSULTA = 30

# Estados de ODBC que significan "se cayó o no hay conexión"
ESTADOS_SIN_CONEXION = {"08S01", "08001", "08003", "08004", "08007", "HYT00", "HYT01"}


def revisar_configuracion():
    """Devuelve una lista de problemas en escritorio.env (vacía si todo está bien)."""
    problemas = []
    if not (CARPETA / "escritorio.env").exists():
        problemas.append("No existe el archivo escritorio.env (copia escritorio.env.ejemplo y llénalo).")
    for nombre in ("DB_SERVER", "DB_NAME", "DB_USER", "DB_PASSWORD", "ID_SUCURSAL"):
        if not os.getenv(nombre):
            problemas.append(f"Falta {nombre} en escritorio.env.")
    if os.getenv("ID_SUCURSAL") and not os.getenv("ID_SUCURSAL").strip().isdigit():
        problemas.append("ID_SUCURSAL debe ser un número (el id_sucursal de esta sucursal).")
    return problemas


def id_sucursal_configurada():
    return int(os.getenv("ID_SUCURSAL", "0").strip() or 0)


# =============================================================================
# CONEXIÓN
# =============================================================================
_conexion = None
_candado = threading.RLock()   # una sola consulta a la vez (la ventana usa hilos)


def _valor(texto):
    """Escapa un valor para la cadena ODBC: {valor} con las } dobles."""
    return "{" + str(texto).replace("}", "}}") + "}"


def _cadena_conexion():
    servidor = os.getenv("DB_SERVER", "").strip()
    puerto = os.getenv("DB_PORT", "1433").strip() or "1433"
    # Con instancia con nombre (localhost\SQLEXPRESS) no se pone puerto
    direccion = servidor if "\\" in servidor else f"tcp:{servidor},{puerto}"

    # Igual que servidor/db.js:
    #   en Azure  -> DB_ENCRYPT=true  (conexión cifrada, certificado verificado)
    #   en tu PC  -> DB_ENCRYPT vacío (sin cifrar, se confía en el certificado local)
    cifrar = os.getenv("DB_ENCRYPT", "").strip().lower() == "true"

    partes = {
        "DRIVER": _valor(os.getenv("DB_DRIVER", "ODBC Driver 18 for SQL Server")),
        "SERVER": direccion,
        "DATABASE": _valor(os.getenv("DB_NAME", "FitManager")),
        "UID": _valor(os.getenv("DB_USER", "")),
        "PWD": _valor(os.getenv("DB_PASSWORD", "")),
        "Encrypt": "yes" if cifrar else "no",
        "TrustServerCertificate": "no" if cifrar else "yes",
        "APP": "FitManager Escritorio",
    }
    return ";".join(f"{clave}={valor}" for clave, valor in partes.items())


def _conectar():
    """La primera vez abre la conexión; las siguientes devuelve la misma."""
    global _conexion
    if _conexion is None:
        problemas = revisar_configuracion()
        if problemas:
            raise ErrorBD("\n".join(problemas))
        # autocommit=True: cada procedimiento maneja su propia transacción
        _conexion = pyodbc.connect(_cadena_conexion(), autocommit=True, timeout=SEGUNDOS_PARA_CONECTAR)
        _conexion.timeout = SEGUNDOS_POR_CONSULTA
    return _conexion


def _olvidar_conexion():
    """Cierra la conexión rota para abrir una nueva en la próxima consulta."""
    global _conexion
    if _conexion is not None:
        try:
            _conexion.close()
        except pyodbc.Error:
            pass
    _conexion = None


def cerrar():
    with _candado:
        _olvidar_conexion()


# =============================================================================
# ERRORES
# =============================================================================
def _estado_odbc(error):
    return error.args[0] if error.args and isinstance(error.args[0], str) else ""


def _traducir_error(error):
    """Convierte un error de pyodbc en un ErrorBD con un mensaje entendible.

    Los mensajes de SQL Server llegan así:
      [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]La clase ya no tiene cupo. (50025) (SQLExecDirectW)
    """
    estado = _estado_odbc(error)
    texto = str(error.args[1]) if len(error.args) > 1 else str(error)

    encontrado = re.search(r"\[SQL Server\](.*)\((\d+)\)\s*\(SQL\w*\)", texto, re.S)
    mensaje = encontrado.group(1).strip() if encontrado else ""
    numero = int(encontrado.group(2)) if encontrado else 0

    if numero >= 50000:                                   # THROW de los procedimientos del equipo
        return ErrorBD(mensaje)
    if numero == 2812:                                    # Could not find stored procedure
        return ErrorBD("Falta un procedimiento en la base. Ejecuta servidor/sql/06_app_escritorio.sql.\n\n" + mensaje)
    if numero == 229:                                     # The EXECUTE permission was denied
        return ErrorBD("El usuario de la base no tiene permiso. Revisa que sea miembro de rol_app_sucursal "
                       "(servidor/sql/06_app_escritorio.sql).\n\n" + mensaje)
    if numero == 40615:                                   # Firewall de Azure
        return ErrorBD("Azure SQL no deja entrar a esta computadora: agrega su IP pública en las reglas "
                       "de firewall del servidor (portal de Azure → Redes).")
    if estado == "IM002":
        return ErrorBD("No está instalado el driver \"ODBC Driver 18 for SQL Server\". Instálalo desde el sitio "
                       "de Microsoft o cambia DB_DRIVER en escritorio.env.")
    if estado == "28000" or numero == 18456:
        return ErrorBD("La base rechazó el usuario o la contraseña de escritorio.env (DB_USER / DB_PASSWORD).")
    if estado in ESTADOS_SIN_CONEXION:
        return ErrorBD("No se pudo conectar con la base de datos. Revisa el internet y DB_SERVER en "
                       "escritorio.env, e intenta de nuevo.")

    print("[BD] Error no esperado:", texto)               # el detalle queda en la terminal
    return ErrorBD("Ocurrió un error en la base de datos. El detalle está en la terminal.")


# =============================================================================
# EJECUTAR UN PROCEDIMIENTO
# =============================================================================
def _leer_resultados(cursor):
    """Lee TODAS las tablas que devuelve el procedimiento (como recordsets en Node)."""
    tablas = []
    while True:
        if cursor.description:                            # este resultado trae filas
            columnas = [c[0] for c in cursor.description]
            tablas.append([dict(zip(columnas, fila)) for fila in cursor.fetchall()])
        if not cursor.nextset():
            break
    return tablas


def ejecutar(procedimiento, reintentar=True, **parametros):
    """Ejecuta dbo.<procedimiento> con parámetros por nombre y devuelve una lista de tablas.

    ejecutar("usp_Escritorio_Resumen", id_sucursal=1)
      -> [[{"clientes_activos": 12, "facturas_hoy": 3, ...}]]

    reintentar=True: si la conexión se había caído (Azure la cierra si
    nadie la usa) se reconecta y se intenta UNA vez más. Solo se usa en
    consultas; en cobros es False para no facturar dos veces.
    """
    if not re.fullmatch(r"usp_\w+", procedimiento) or not all(re.fullmatch(r"\w+", n) for n in parametros):
        raise ValueError("Nombre de procedimiento o parámetro no válido")

    sql = "SET NOCOUNT ON; EXEC dbo." + procedimiento
    if parametros:
        sql += " " + ", ".join(f"@{nombre} = ?" for nombre in parametros)
    valores = list(parametros.values())

    with _candado:
        for intento in (1, 2):
            try:
                cursor = _conectar().cursor()
                try:
                    cursor.execute(sql, valores)
                    return _leer_resultados(cursor)
                finally:
                    cursor.close()
            except pyodbc.Error as error:
                if _estado_odbc(error) in ESTADOS_SIN_CONEXION:
                    _olvidar_conexion()
                    if reintentar and intento == 1:
                        continue
                raise _traducir_error(error) from None


def _ultima_tabla(tablas):
    """Como recordsets.at(-1) en Node: el resultado final del procedimiento."""
    return tablas[-1] if tablas else []


def _primera_fila(tablas):
    filas = _ultima_tabla(tablas)
    if not filas:
        raise ErrorBD("La base de datos no devolvió datos.")
    return filas[0]


# =============================================================================
# INICIO DE SESIÓN (misma lógica que servidor/servicios/cuentas.js)
# =============================================================================
# Argon2id con los mismos valores que el servidor Node (OWASP):
# 19 MiB de memoria, 2 pasadas, 1 hilo, hash de 32 bytes y sal de 16.
_argon2 = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1,
                         hash_len=32, salt_len=16, type=Type.ID)

LARGO_MAXIMO_CONTRASENA = 100
ESTADOS_BLOQUEADOS = {"suspendido", "bloqueado"}
# Quien SOLO tiene estos roles no puede usar la app de sucursal
# (un cliente no debe poder facturar). Ajusta si cambian los roles.
ROLES_SIN_ACCESO = {"cliente"}

MAXIMO_INTENTOS = 5
MINUTOS_BLOQUEO = 15
_intentos = {}           # alias -> [fallos, bloqueado_hasta]
_hash_falso = None


def _minutos_bloqueado(alias):
    fallos, hasta = _intentos.get(alias, [0, 0])
    restante = hasta - time.time()
    if hasta and restante <= 0:
        _intentos.pop(alias, None)
        return 0
    return int(restante // 60) + 1 if hasta else 0


def _registrar_fallo(alias):
    registro = _intentos.setdefault(alias, [0, 0])
    registro[0] += 1
    if registro[0] >= MAXIMO_INTENTOS:
        registro[1] = time.time() + MINUTOS_BLOQUEO * 60


def _coincide(hash_guardado, contrasena):
    """Compara sin lanzar error si el hash guardado está dañado."""
    try:
        return _argon2.verify(hash_guardado, contrasena)
    except (VerificationError, InvalidHashError):
        return False


def _gastar_tiempo_igual(contrasena):
    """Si el alias no existe se hace igual un cálculo Argon2: así la respuesta
    tarda lo mismo y nadie averigua qué alias existen midiendo el tiempo."""
    global _hash_falso
    if _hash_falso is None:
        _hash_falso = _argon2.hash("alias-que-no-existe")
    _coincide(_hash_falso, contrasena or "x")


def _registrar_intento(id_alias, exitoso):
    ejecutar("usp_RegistrarIntentoLogin", reintentar=False,
             id_alias=id_alias, resultado="Exitoso" if exitoso else "Fallido")


def _comprobar_contrasena(alias, contrasena):
    """Devuelve el id_alias si la contraseña es correcta, o None."""
    filas = _ultima_tabla(ejecutar("usp_ObtenerCredencial", alias=alias))
    if not filas:                                         # el alias no existe
        _gastar_tiempo_igual(contrasena)
        return None
    credencial = filas[0]

    if credencial["contrasena_argon2"]:                   # ya está en Argon2
        correcta = _coincide(credencial["contrasena_argon2"], contrasena)
        _registrar_intento(credencial["id_alias"], correcta)
        return credencial["id_alias"] if correcta else None

    if credencial["tiene_hash_viejo"]:                    # usuario viejo con SHA-256
        viejo = _primera_fila(ejecutar("usp_ValidarLogin", reintentar=False,
                                       alias=alias, contrasena_plana=contrasena))
        if viejo.get("resultado") != "Exitoso":           # usp_ValidarLogin ya guardó el intento
            return None
        # Migración a Argon2 (igual que hace el servidor Node)
        ejecutar("usp_GuardarContrasenaArgon2", reintentar=False,
                 id_alias=credencial["id_alias"], contrasena_argon2=_argon2.hash(contrasena))
        return credencial["id_alias"]

    _gastar_tiempo_igual(contrasena)                      # no tiene contraseña guardada
    _registrar_intento(credencial["id_alias"], False)
    return None


def iniciar_sesion(alias, contrasena):
    """Revisa usuario y contraseña. Devuelve los datos del empleado o lanza ErrorBD.

    {"id_alias", "alias", "id_usuario", "nombre", "estado", "roles",
     "id_sucursal", "sucursal"}
    """
    alias = (alias or "").strip()
    contrasena = contrasena or ""
    if not alias or not contrasena:
        raise ErrorBD("Escribe tu usuario y tu contraseña.")
    if len(contrasena) > LARGO_MAXIMO_CONTRASENA:
        raise ErrorBD("Usuario o contraseña incorrectos.")

    espera = _minutos_bloqueado(alias)
    if espera:
        raise ErrorBD(f"Demasiados intentos. Intenta de nuevo en {espera} minutos.")

    id_alias = _comprobar_contrasena(alias, contrasena)
    if not id_alias:
        _registrar_fallo(alias)
        raise ErrorBD("Usuario o contraseña incorrectos.")   # mismo mensaje si el alias no existe
    _intentos.pop(alias, None)

    empleado = _primera_fila(ejecutar("usp_Escritorio_DatosEmpleado",
                                      id_alias=id_alias, id_sucursal=id_sucursal_configurada()))

    if (empleado["estado"] or "").strip().lower() in ESTADOS_BLOQUEADOS:
        raise ErrorBD("Tu usuario no está activo. Habla con el administrador.")

    roles = {r.strip().lower() for r in (empleado["roles"] or "").split(",") if r.strip()}
    if not roles - ROLES_SIN_ACCESO:
        raise ErrorBD("Tu usuario no tiene permiso para usar la app de sucursal.")

    return empleado


# =============================================================================
# FUNCIONES QUE USA CADA PÁGINA DE PRINCIPAL.py
# =============================================================================
def actualizar_membresias_vencidas():
    """Pasa a 'Vencida' las membresías cuya fecha ya terminó (al abrir la app)."""
    ejecutar("usp_ActualizarEstadoMembresias")


def resumen(id_sucursal):
    return _primera_fila(ejecutar("usp_Escritorio_Resumen", id_sucursal=id_sucursal))


def catalogos(id_sucursal):
    clientes, tipos, metodos, entrenadores = ejecutar("usp_Escritorio_Catalogos", id_sucursal=id_sucursal)
    return {"clientes": clientes, "tipos": tipos, "metodos": metodos, "entrenadores": entrenadores}


def listar_facturas(id_sucursal, cantidad=100):
    return _ultima_tabla(ejecutar("usp_Escritorio_ListarFacturas", id_sucursal=id_sucursal, cantidad=cantidad))


def facturar_membresia(id_cliente, id_tipo_membresia, id_metodo_pago, meses, id_sucursal, id_usuario):
    return _primera_fila(ejecutar(
        "usp_Escritorio_FacturarMembresia", reintentar=False,
        id_cliente=id_cliente, id_tipo_membresia=id_tipo_membresia, id_metodo_pago=id_metodo_pago,
        meses=meses, id_sucursal=id_sucursal, id_usuario=id_usuario))


def listar_clases(id_sucursal):
    return _ultima_tabla(ejecutar("usp_Escritorio_ListarClases", id_sucursal=id_sucursal))


def cambiar_horario(id_clase, id_sucursal, nueva_fecha_hora, motivo, id_usuario):
    return _primera_fila(ejecutar(
        "usp_Escritorio_CambiarHorarioClase", reintentar=False,
        id_clase=id_clase, id_sucursal=id_sucursal, nueva_fecha_hora=nueva_fecha_hora,
        motivo=motivo or None, id_usuario=id_usuario))


def listar_asignaciones(id_sucursal):
    return _ultima_tabla(ejecutar("usp_Escritorio_ListarAsignaciones", id_sucursal=id_sucursal))


def cambiar_entrenador(id_cliente, id_entrenador, motivo, id_usuario):
    return _primera_fila(ejecutar(
        "usp_Escritorio_CambiarEntrenador", reintentar=False,
        id_cliente=id_cliente, id_entrenador=id_entrenador, motivo=motivo or None, id_usuario=id_usuario))


def listar_productos(id_sucursal):
    return _ultima_tabla(ejecutar("usp_Escritorio_ListarProductos", id_sucursal=id_sucursal))


def vender_productos(id_cliente, id_sucursal, id_metodo_pago, id_usuario, carrito):
    """carrito: {id_producto: cantidad}"""
    productos = json.dumps([{"id_producto": int(i), "cantidad": int(c)} for i, c in carrito.items()])
    return _primera_fila(ejecutar(
        "usp_Escritorio_VenderProductos", reintentar=False,
        id_cliente=id_cliente, id_sucursal=id_sucursal, id_metodo_pago=id_metodo_pago,
        id_usuario=id_usuario, productos=productos))
