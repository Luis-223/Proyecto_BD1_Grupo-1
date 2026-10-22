/* =========================================================
   04_permisos_azure.sql — PERMISOS QUE LE FALTAN A fitmanager_servidor
   Ejecutar en Azure (fitmanager-grupo1.database.windows.net),
   con la base FitManager seleccionada en SSMS.
   Se puede ejecutar más de una vez sin errores.

   El usuario ya tiene EXECUTE sobre el esquema dbo (procedimientos y
   funciones) y SELECT sobre 8 tablas del login. Pero varias rutas del
   servidor consultan tablas DIRECTAMENTE (sin procedimiento):
     - rutas/cliente.js  -> /cliente/membresia, asistencias, rutinas, metas, notificaciones
     - rutas/clases.js   -> /clases, /clases/mias
   Sin estos permisos la base responde "The SELECT permission was denied"
   y la app muestra un error.
   ========================================================= */

/* ---------------------------------------------------------
   0. ¿ESTAMOS EN LA BASE CORRECTA?
   --------------------------------------------------------- */
SELECT @@SERVERNAME AS servidor, DB_NAME() AS base_actual;
DECLARE @base_actual NVARCHAR(128) = DB_NAME();
IF @base_actual <> 'FitManager'
BEGIN
    RAISERROR('Estás en la base "%s", no en FitManager. Cambia la base en SSMS y vuelve a ejecutar.', 16, 1, @base_actual);
    SET NOEXEC ON;
END
GO

/* ---------------------------------------------------------
   1. LECTURA DE TABLAS QUE USAN LAS RUTAS JSON
   --------------------------------------------------------- */
-- Mi membresía (GET /cliente/membresia)
GRANT SELECT ON dbo.Membresia              TO [fitmanager_servidor];
GRANT SELECT ON dbo.TipoMembresia          TO [fitmanager_servidor];
GRANT SELECT ON dbo.TipoMembresiaBeneficio TO [fitmanager_servidor];
GRANT SELECT ON dbo.Beneficio              TO [fitmanager_servidor];

-- Asistencias, rutinas y metas
GRANT SELECT ON dbo.Asistencia      TO [fitmanager_servidor];
GRANT SELECT ON dbo.Rutina          TO [fitmanager_servidor];
GRANT SELECT ON dbo.DiaRutina       TO [fitmanager_servidor];
GRANT SELECT ON dbo.BloqueEjercicio TO [fitmanager_servidor];
GRANT SELECT ON dbo.Ejercicio       TO [fitmanager_servidor];
GRANT SELECT ON dbo.GrupoMuscular   TO [fitmanager_servidor];
GRANT SELECT ON dbo.SerieEjercicio  TO [fitmanager_servidor];
GRANT SELECT ON dbo.Meta            TO [fitmanager_servidor];

-- Notificaciones (también se marcan como leídas)
GRANT SELECT, UPDATE ON dbo.Notificacion TO [fitmanager_servidor];

-- Clases grupales
GRANT SELECT ON dbo.ClaseGrupal          TO [fitmanager_servidor];
GRANT SELECT ON dbo.ClienteClase         TO [fitmanager_servidor];
GRANT SELECT ON dbo.AsignacionEntrenador TO [fitmanager_servidor];
GO

/* ---------------------------------------------------------
   2. REVISIÓN: ¿están todos los procedimientos que usa el servidor?
      Si alguno sale como FALTA, hay que crearlo en Azure:
        usp_PagarMembresiaApp -> ejecutar 03_membresia.sql
        usp_ListarCatalogos / usp_RegistrarCliente -> 02_registro.sql
        los demás usp_ de credenciales -> 01_argon2.sql
   --------------------------------------------------------- */
SELECT p.nombre,
       CASE WHEN OBJECT_ID('dbo.' + p.nombre) IS NULL THEN 'FALTA' ELSE 'ok' END AS estado
FROM (VALUES
    ('usp_ObtenerCredencial'), ('usp_GuardarContrasenaArgon2'), ('usp_RegistrarIntentoLogin'),
    ('usp_ValidarLogin'), ('usp_ObtenerRespuestasSeguridad'), ('usp_GuardarRespuestaSeguridad'),
    ('usp_ListarPreguntasSeguridad'), ('usp_ListarCatalogos'), ('usp_RegistrarCliente'),
    ('usp_FacturarMembresia'), ('usp_PagarMembresiaApp'), ('usp_InscribirClase'),
    ('fn_TieneBeneficio')
) AS p(nombre)
ORDER BY estado, p.nombre;
GO

SET NOEXEC OFF;
GO
