/* =========================================================
   09_clases_app.sql — CLASES GRUPALES EN LA APP (clases_grupales.tsx y clase_detalle.tsx)
   Ejecutar en la base FitManager (después de 08_pagos_sucursales.sql).
   Se puede ejecutar más de una vez sin errores.

   Crea:
     - usp_App_DetalleClase        → la clase, su entrenador y quiénes están inscritos
     - usp_App_CancelarInscripcion → el cliente se sale de una clase que no ha empezado

   La inscripción sigue siendo usp_InscribirClase (FitManager.sql): valida
   cupo, que la clase no haya pasado y que la membresía incluya clases (Oro).

   Privacidad: de los demás participantes solo se muestra el primer nombre
   y la inicial del apellido ("María L."), nunca datos de contacto.

   Errores: números 50340 a 50359 (THROW).
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
   1. DETALLE DE UNA CLASE
      Resultado 1: la clase y su entrenador (la asignación más reciente)
      Resultado 2: los participantes, en orden de inscripción
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_DetalleClase
    @id_clase   INT,
    @id_cliente INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM ClaseGrupal WHERE id_clase = @id_clase)
        THROW 50340, N'La clase no existe.', 1;

    DECLARE @hoy DATE = CAST(GETDATE() AS DATE);

    SELECT c.id_clase,
           c.nombre_clase,
           c.fecha_hora,
           c.cupo_maximo,
           s.nombre_sucursal AS sucursal,
           ins.inscritos,
           c.cupo_maximo - ins.inscritos AS cupos_disponibles,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM ClienteClase cc
                                  WHERE cc.id_clase = c.id_clase AND cc.id_cliente = @id_cliente)
                     THEN 1 ELSE 0 END AS BIT) AS ya_inscrito,
           CAST(CASE WHEN c.fecha_hora > GETDATE() THEN 0 ELSE 1 END AS BIT) AS ya_empezo,
           dbo.fn_TieneBeneficio(@id_cliente, 'CLASES', @hoy) AS incluye_clases,
           ent.id_entrenador,
           ent.nombre        AS entrenador,
           ent.especialidad  AS entrenador_especialidad,
           ent.nivel         AS entrenador_nivel,
           ent.anios_experiencia AS entrenador_anios
    FROM ClaseGrupal c
    JOIN Sucursal s ON s.id_sucursal = c.id_sucursal
    CROSS APPLY (SELECT COUNT(*) AS inscritos FROM ClienteClase cc WHERE cc.id_clase = c.id_clase) ins
    OUTER APPLY (
        SELECT TOP 1 en.id_entrenador,
               u.primer_nombre_us + ' ' + u.primer_apellido_us AS nombre,
               en.especialidad,
               ne.nombre_nivel AS nivel,
               CASE WHEN en.fecha_contratacion IS NULL THEN NULL
                    ELSE DATEDIFF(MONTH, en.fecha_contratacion, @hoy) / 12 END AS anios_experiencia
        FROM AsignacionEntrenador ae
        JOIN Entrenador en ON en.id_entrenador = ae.id_entrenador
        JOIN Usuario u     ON u.id_usuario     = en.id_usuario
        LEFT JOIN NivelEntrenador ne ON ne.id_nivel_entrenador = en.id_nivel_entrenador
        WHERE ae.id_clase = c.id_clase
        ORDER BY ae.fecha_asignacion DESC, ae.id_asignacion DESC
    ) ent
    WHERE c.id_clase = @id_clase;

    SELECT u.primer_nombre_us + ' ' + LEFT(u.primer_apellido_us, 1) + '.' AS nombre,
           cc.fecha_inscripcion,
           CAST(CASE WHEN cc.id_cliente = @id_cliente THEN 1 ELSE 0 END AS BIT) AS soy_yo
    FROM ClienteClase cc
    JOIN Cliente cl ON cl.id_cliente = cc.id_cliente
    JOIN Usuario u  ON u.id_usuario  = cl.id_usuario
    WHERE cc.id_clase = @id_clase
    ORDER BY cc.fecha_inscripcion, cc.id_cliente;
END
GO

/* ---------------------------------------------------------
   2. CANCELAR LA INSCRIPCIÓN
      Solo si la clase todavía no empieza. El cupo queda libre al instante.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_CancelarInscripcion
    @id_cliente INT,
    @id_clase   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @fecha DATETIME, @id_sucursal INT;
    SELECT @fecha = fecha_hora, @id_sucursal = id_sucursal FROM ClaseGrupal WHERE id_clase = @id_clase;

    IF @fecha IS NULL
        THROW 50341, N'La clase no existe.', 1;
    IF @fecha <= GETDATE()
        THROW 50342, N'La clase ya empezó; ya no se puede cancelar.', 1;

    DELETE FROM ClienteClase
    WHERE id_cliente = @id_cliente AND id_clase = @id_clase;

    IF @@ROWCOUNT = 0
        THROW 50343, N'No estás inscrito en esta clase.', 1;

    -- Para el aviso en tiempo real (rutas/clases.js)
    SELECT @id_sucursal AS id_sucursal,
           (SELECT cupo_maximo FROM ClaseGrupal WHERE id_clase = @id_clase)
         - (SELECT COUNT(*) FROM ClienteClase WHERE id_clase = @id_clase) AS cupos_disponibles;
END
GO

/* ---------------------------------------------------------
   3. PERMISOS (en Azure ya los tiene por EXECUTE sobre dbo)
   --------------------------------------------------------- */
DECLARE @usuario SYSNAME, @orden NVARCHAR(1000);
DECLARE usuarios CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.database_principals
    WHERE name IN ('FitManager', 'fitmanager_servidor');
OPEN usuarios;
FETCH NEXT FROM usuarios INTO @usuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @orden = N'GRANT EXECUTE ON dbo.usp_App_DetalleClase TO '        + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_CancelarInscripcion TO ' + QUOTENAME(@usuario) + N';';
    EXEC (@orden);
    PRINT 'Permisos concedidos a: ' + @usuario;
    FETCH NEXT FROM usuarios INTO @usuario;
END
CLOSE usuarios;
DEALLOCATE usuarios;
GO

/* ---------------------------------------------------------
   4. REVISIÓN: deben salir los 2 procedimientos
   --------------------------------------------------------- */
SELECT name AS procedimiento FROM sys.procedures
WHERE name IN ('usp_App_DetalleClase', 'usp_App_CancelarInscripcion');
GO

SET NOEXEC OFF; -- por si el paso 0 detuvo el script
GO
