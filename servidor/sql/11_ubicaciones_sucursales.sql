/* =========================================================
   11_ubicaciones_sucursales.sql — MAPA DE ANTIGUA, QUICHÉ, ZONA 10 Y ZONA 18
   Ejecutar en la base FitManager (después de 08_pagos_sucursales.sql).
   Se puede ejecutar más de una vez.

   Por qué no salía su mapa:
     - "Antigua": el municipio se llama "Antigua Guatemala"; el nombre de la
       sucursal no lo contiene completo, así que no se asignó solo.
     - "Quiché": el municipio es "Santa Cruz del Quiché".
     - "Zona 10" y "Zona 18": están en el municipio Guatemala, pero el centro
       del municipio pondría las dos en el mismo punto.
   Este script les pone municipio y el punto de su zona, buscando la
   sucursal por su nombre (sin importar mayúsculas ni tildes).
   Si tus sucursales se llaman distinto, cambia los patrones de la tabla.
   ========================================================= */

SET NOCOUNT ON;
SET XACT_ABORT ON;

SELECT @@SERVERNAME AS servidor, DB_NAME() AS base_actual;
IF DB_NAME() <> 'FitManager'
BEGIN
    RAISERROR('Estás en otra base. Selecciona FitManager en SSMS y vuelve a ejecutar.', 16, 1);
    RETURN;
END
IF COL_LENGTH('dbo.Sucursal', 'latitud') IS NULL
BEGIN
    RAISERROR('Primero ejecuta 08_pagos_sucursales.sql.', 16, 1);
    RETURN;
END

-- patrón del nombre de la sucursal | departamento | municipio | punto en el mapa
DECLARE @ubicaciones TABLE (
    patron VARCHAR(60), departamento VARCHAR(25), municipio VARCHAR(50), latitud DECIMAL(9,6), longitud DECIMAL(9,6)
);
INSERT INTO @ubicaciones VALUES
    ('%Antigua%',   'Sacatepéquez', 'Antigua Guatemala',     14.558600, -90.729500),
    ('%Quich%',     'Quiché',       'Santa Cruz del Quiché', 15.030600, -91.148900),
    ('%Zona 10%',   'Guatemala',    'Guatemala',             14.599500, -90.509500),
    ('%Zona 18%',   'Guatemala',    'Guatemala',             14.650500, -90.476000);

BEGIN TRY
    BEGIN TRANSACTION;

    -- Departamento que falte ("Quiché" también se busca como "El Quiché")
    INSERT INTO Departamento (nombre_departamento)
    SELECT DISTINCT u.departamento FROM @ubicaciones u
    WHERE NOT EXISTS (SELECT 1 FROM Departamento d
                      WHERE d.nombre_departamento COLLATE Latin1_General_CI_AI LIKE '%' + u.departamento COLLATE Latin1_General_CI_AI);

    -- Municipio que falte
    INSERT INTO Municipio (id_departamento, nombre_municipio)
    SELECT DISTINCT d.id_departamento, u.municipio
    FROM @ubicaciones u
    CROSS APPLY (SELECT TOP 1 id_departamento FROM Departamento
                 WHERE nombre_departamento COLLATE Latin1_General_CI_AI LIKE '%' + u.departamento COLLATE Latin1_General_CI_AI
                 ORDER BY id_departamento) d
    WHERE NOT EXISTS (SELECT 1 FROM Municipio m
                      WHERE m.id_departamento = d.id_departamento
                        AND m.nombre_municipio COLLATE Latin1_General_CI_AI = u.municipio COLLATE Latin1_General_CI_AI);

    -- Municipio y punto de cada sucursal que coincida con un patrón.
    -- Aquí SÍ se reemplaza la ubicación (por si se había puesto el centro del municipio).
    UPDATE s SET
        id_municipio = m.id_municipio,
        latitud      = u.latitud,
        longitud     = u.longitud
    FROM Sucursal s
    JOIN @ubicaciones u ON s.nombre_sucursal COLLATE Latin1_General_CI_AI LIKE u.patron COLLATE Latin1_General_CI_AI
    CROSS APPLY (SELECT TOP 1 id_departamento FROM Departamento
                 WHERE nombre_departamento COLLATE Latin1_General_CI_AI LIKE '%' + u.departamento COLLATE Latin1_General_CI_AI
                 ORDER BY id_departamento) d
    JOIN Municipio m ON m.id_departamento = d.id_departamento
                    AND m.nombre_municipio COLLATE Latin1_General_CI_AI = u.municipio COLLATE Latin1_General_CI_AI;

    PRINT CONCAT('Sucursales actualizadas: ', @@ROWCOUNT);
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH

-- REVISIÓN: todas las sucursales. Las que digan "SIN MAPA" necesitan su
-- municipio o sus coordenadas (ver la sección "A MANO" de 08_pagos_sucursales.sql).
SELECT s.id_sucursal, s.nombre_sucursal, m.nombre_municipio AS municipio, d.nombre_departamento AS departamento,
       s.latitud, s.longitud,
       CASE WHEN s.latitud IS NULL OR s.longitud IS NULL THEN 'SIN MAPA' ELSE 'ok' END AS mapa
FROM Sucursal s
LEFT JOIN Municipio m    ON m.id_municipio    = s.id_municipio
LEFT JOIN Departamento d ON d.id_departamento = m.id_departamento
ORDER BY mapa DESC, s.id_sucursal;
GO
