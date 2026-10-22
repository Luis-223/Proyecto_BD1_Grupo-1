/* =========================================================
   07_entrenadores.sql — ELEGIR ENTRENADORES DESDE LA APP (mi_entrenador.tsx)
   Ejecutar en la base FitManager (después de 06_app_escritorio.sql).
   Se puede ejecutar más de una vez sin errores.

   Reglas:
     - Un cliente puede tener VARIOS entrenadores a la vez.
     - Solo puede elegir entrenadores de SU sucursal.
     - Quitar un entrenador no borra nada: la asignación se cierra con
       fecha_fin = hoy, así queda el historial (igual que en escritorio).

   Crea:
     - usp_App_ListarEntrenadores → entrenadores de su sucursal con sus datos
     - usp_App_AgregarEntrenador  → agrega un entrenador al cliente
     - usp_App_QuitarEntrenador   → quita (cierra) esa asignación

   Ajusta (app de escritorio, para que acepte varios entrenadores):
     - usp_Escritorio_ListarAsignaciones → muestra TODOS los entrenadores actuales
     - usp_Escritorio_CambiarEntrenador  → AGREGA el entrenador sin quitar los demás
     IMPORTANTE: si vuelves a ejecutar 06_app_escritorio.sql, ejecuta
     este script después, o esos dos procedimientos vuelven a la versión
     de un solo entrenador.

   Errores: números 50300 a 50319 (THROW).
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
   1. ENTRENADORES DE LA SUCURSAL DEL CLIENTE
      Solo usuarios en estado activo (no Inactivo/Suspendido/Bloqueado).
      "asignado" = 1 si ya es uno de sus entrenadores.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_ListarEntrenadores
    @id_cliente INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @id_sucursal INT = (SELECT id_sucursal FROM Cliente WHERE id_cliente = @id_cliente);
    IF @id_sucursal IS NULL
        THROW 50300, N'El cliente no existe.', 1;

    DECLARE @hoy DATE = CAST(GETDATE() AS DATE);

    SELECT en.id_entrenador,
           u.primer_nombre_us + ' ' + u.primer_apellido_us AS nombre,
           en.especialidad,
           ne.nombre_nivel                                AS nivel,
           s.nombre_sucursal                              AS sucursal,
           en.fecha_contratacion,
           CASE WHEN en.fecha_contratacion IS NULL THEN NULL
                ELSE DATEDIFF(MONTH, en.fecha_contratacion, @hoy) / 12 END AS anios_experiencia,
           -- Clientes que lo tienen asignado ahora
           (SELECT COUNT(DISTINCT ae.id_cliente)
            FROM AsignacionEntrenador ae
            WHERE ae.id_entrenador = en.id_entrenador
              AND ae.id_cliente IS NOT NULL AND ae.fecha_fin IS NULL)  AS clientes_activos,
           -- Próximas clases grupales que imparte (la asignación más reciente de cada clase)
           (SELECT COUNT(*)
            FROM ClaseGrupal cg
            CROSS APPLY (SELECT TOP 1 ae.id_entrenador
                         FROM AsignacionEntrenador ae
                         WHERE ae.id_clase = cg.id_clase
                         ORDER BY ae.fecha_asignacion DESC, ae.id_asignacion DESC) ult
            WHERE ult.id_entrenador = en.id_entrenador
              AND cg.fecha_hora > GETDATE())                           AS clases_proximas,
           -- Rutinas que ha creado para este cliente
           (SELECT COUNT(*) FROM Rutina r
            WHERE r.id_entrenador = en.id_entrenador AND r.id_cliente = @id_cliente) AS mis_rutinas,
           CAST(CASE WHEN mia.id_asignacion IS NULL THEN 0 ELSE 1 END AS BIT) AS asignado,
           mia.fecha_asignacion                           AS asignado_desde
    FROM Entrenador en
    JOIN Usuario u          ON u.id_usuario  = en.id_usuario
    JOIN Estado est         ON est.id_estado = u.id_estado
    JOIN Sucursal s         ON s.id_sucursal = en.id_sucursal
    LEFT JOIN NivelEntrenador ne ON ne.id_nivel_entrenador = en.id_nivel_entrenador
    OUTER APPLY (SELECT TOP 1 ae.id_asignacion, ae.fecha_asignacion
                 FROM AsignacionEntrenador ae
                 WHERE ae.id_entrenador = en.id_entrenador
                   AND ae.id_cliente = @id_cliente
                   AND ae.fecha_fin IS NULL
                 ORDER BY ae.fecha_asignacion DESC, ae.id_asignacion DESC) mia
    WHERE en.id_sucursal = @id_sucursal
      AND LOWER(est.nombre_estado) NOT IN ('inactivo', 'suspendido', 'bloqueado')
    ORDER BY CASE WHEN mia.id_asignacion IS NULL THEN 1 ELSE 0 END,   -- primero los suyos
             u.primer_nombre_us, u.primer_apellido_us;
END
GO

/* ---------------------------------------------------------
   2. AGREGAR UN ENTRENADOR AL CLIENTE
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_AgregarEntrenador
    @id_cliente    INT,
    @id_entrenador INT,
    @id_usuario    INT          -- el propio cliente (queda como quien hizo la asignación)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @sucursal_cliente INT = (SELECT id_sucursal FROM Cliente WHERE id_cliente = @id_cliente);
    IF @sucursal_cliente IS NULL
        THROW 50301, N'El cliente no existe.', 1;

    DECLARE @sucursal_entrenador INT, @estado VARCHAR(30);
    SELECT @sucursal_entrenador = en.id_sucursal, @estado = LOWER(est.nombre_estado)
    FROM Entrenador en
    JOIN Usuario u  ON u.id_usuario  = en.id_usuario
    JOIN Estado est ON est.id_estado = u.id_estado
    WHERE en.id_entrenador = @id_entrenador;

    IF @sucursal_entrenador IS NULL
        THROW 50302, N'El entrenador no existe.', 1;
    IF @sucursal_entrenador <> @sucursal_cliente
        THROW 50303, N'Solo puedes elegir entrenadores de tu sucursal.', 1;
    IF @estado IN ('inactivo', 'suspendido', 'bloqueado')
        THROW 50304, N'Ese entrenador no está disponible.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Revisar dentro de la transacción (con bloqueo) para que dos toques
        -- seguidos en la app no creen la misma asignación dos veces
        IF EXISTS (SELECT 1 FROM AsignacionEntrenador WITH (UPDLOCK, HOLDLOCK)
                   WHERE id_cliente = @id_cliente AND id_entrenador = @id_entrenador
                     AND fecha_fin IS NULL)
            THROW 50305, N'Ese entrenador ya es uno de tus entrenadores.', 1;

        INSERT INTO AsignacionEntrenador (id_entrenador, id_cliente, id_clase, fecha_asignacion, motivo, id_usuario)
        VALUES (@id_entrenador, @id_cliente, NULL, CAST(GETDATE() AS DATE), 'Elegido por el cliente desde la app', @id_usuario);

        COMMIT TRANSACTION;

        SELECT CAST(SCOPE_IDENTITY() AS INT) AS id_asignacion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   3. QUITAR UN ENTRENADOR DEL CLIENTE (cierra la asignación)
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_QuitarEntrenador
    @id_cliente    INT,
    @id_entrenador INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE AsignacionEntrenador
    SET fecha_fin = CAST(GETDATE() AS DATE)
    WHERE id_cliente = @id_cliente
      AND id_entrenador = @id_entrenador
      AND fecha_fin IS NULL;

    IF @@ROWCOUNT = 0
        THROW 50306, N'Ese entrenador no está entre tus entrenadores.', 1;

    SELECT @id_entrenador AS id_entrenador;
END
GO

/* ---------------------------------------------------------
   4. APP DE ESCRITORIO: VARIOS ENTRENADORES POR CLIENTE
      Mismas columnas que antes, así PRINCIPAL.py no cambia:
        entrenador       = todos sus entrenadores, separados por coma
        id_entrenador    = el más reciente
        fecha_asignacion = la asignación más reciente
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ListarAsignaciones
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT c.id_cliente,
           uc.primer_nombre_us + ' ' + uc.primer_apellido_us AS cliente,
           ult.id_entrenador,
           ISNULL(todos.nombres, '(sin entrenador)') AS entrenador,
           ult.fecha_asignacion
    FROM Cliente c
    JOIN Usuario uc ON uc.id_usuario = c.id_usuario
    OUTER APPLY (
        SELECT TOP 1 ae.id_entrenador, ae.fecha_asignacion
        FROM AsignacionEntrenador ae
        WHERE ae.id_cliente = c.id_cliente AND ae.fecha_fin IS NULL
        ORDER BY ae.fecha_asignacion DESC, ae.id_asignacion DESC
    ) ult
    OUTER APPLY (
        SELECT STRING_AGG(n.nombre, ', ') WITHIN GROUP (ORDER BY n.nombre) AS nombres
        FROM (SELECT DISTINCT ue.primer_nombre_us + ' ' + ue.primer_apellido_us AS nombre
              FROM AsignacionEntrenador ae
              JOIN Entrenador en ON en.id_entrenador = ae.id_entrenador
              JOIN Usuario ue    ON ue.id_usuario    = en.id_usuario
              WHERE ae.id_cliente = c.id_cliente AND ae.fecha_fin IS NULL) n
    ) todos
    WHERE c.id_sucursal = @id_sucursal
    ORDER BY uc.primer_nombre_us, uc.primer_apellido_us;
END
GO

-- "Asignar" en escritorio ahora AGREGA el entrenador sin cerrar los demás.
-- Mismos parámetros y mismo resultado (id_asignacion) que antes.
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_CambiarEntrenador
    @id_cliente    INT,
    @id_entrenador INT,
    @motivo        VARCHAR(150) = NULL,
    @id_usuario    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM Cliente WHERE id_cliente = @id_cliente)
        THROW 50230, N'El cliente no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM Entrenador WHERE id_entrenador = @id_entrenador)
        THROW 50231, N'El entrenador no existe.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF EXISTS (SELECT 1 FROM AsignacionEntrenador WITH (UPDLOCK, HOLDLOCK)
                   WHERE id_cliente = @id_cliente AND id_entrenador = @id_entrenador
                     AND fecha_fin IS NULL)
            THROW 50232, N'Ese entrenador ya está asignado a este cliente.', 1;

        INSERT INTO AsignacionEntrenador (id_entrenador, id_cliente, id_clase, fecha_asignacion, motivo, id_usuario)
        VALUES (@id_entrenador, @id_cliente, NULL, CAST(GETDATE() AS DATE), NULLIF(LTRIM(RTRIM(@motivo)), ''), @id_usuario);

        COMMIT TRANSACTION;

        SELECT CAST(SCOPE_IDENTITY() AS INT) AS id_asignacion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   5. PERMISOS
      En Azure, fitmanager_servidor ya tiene EXECUTE sobre todo el
      esquema dbo; esto cubre las copias locales.
   --------------------------------------------------------- */
DECLARE @usuario SYSNAME, @orden NVARCHAR(1000);
DECLARE usuarios CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.database_principals
    WHERE name IN ('FitManager', 'fitmanager_servidor');
OPEN usuarios;
FETCH NEXT FROM usuarios INTO @usuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @orden = N'GRANT EXECUTE ON dbo.usp_App_ListarEntrenadores TO ' + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_AgregarEntrenador TO '  + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_QuitarEntrenador TO '   + QUOTENAME(@usuario) + N';';
    EXEC (@orden);
    PRINT 'Permisos concedidos a: ' + @usuario;
    FETCH NEXT FROM usuarios INTO @usuario;
END
CLOSE usuarios;
DEALLOCATE usuarios;
GO

/* ---------------------------------------------------------
   6. REVISIÓN: deben salir los 5 procedimientos
   --------------------------------------------------------- */
SELECT name AS procedimiento, modify_date AS actualizado
FROM sys.procedures
WHERE name IN ('usp_App_ListarEntrenadores', 'usp_App_AgregarEntrenador', 'usp_App_QuitarEntrenador',
               'usp_Escritorio_ListarAsignaciones', 'usp_Escritorio_CambiarEntrenador')
ORDER BY name;
GO

SET NOEXEC OFF; -- por si el paso 0 detuvo el script
GO
