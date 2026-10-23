# factura_pdf.py — CREA EL PDF DE UNA FACTURA Y LO ABRE O LO IMPRIME
#
# Recibe los datos que devuelve conexion_bd.detalle_factura() y arma
# un PDF tamaño carta en la carpeta "facturas" (junto a PRINCIPAL.py).
#
# Necesita la librería reportlab:   py -3.13 -m pip install reportlab

import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

CARPETA_FACTURAS = Path(__file__).resolve().parent / "facturas"

NOMBRE_GIMNASIO = "FitManager"
LEMA = "Gestión de gimnasio"
VERDE = "#16a34a"
GRIS_OSCURO = "#1f2937"
GRIS_TEXTO = "#6b7280"
GRIS_LINEA = "#e5e7eb"
GRIS_FONDO = "#f9fafb"


class ErrorPDF(Exception):
    """Error con un mensaje listo para mostrarle al usuario."""


def _dinero(valor):
    return f"Q {valor or 0:,.2f}"


def _texto(valor):
    """Texto seguro para un Paragraph de reportlab (que entiende etiquetas tipo HTML)."""
    return escape("" if valor is None else str(valor))


def _nombre_archivo(numero):
    limpio = re.sub(r"[^\w-]", "_", str(numero))
    return f"Factura_{limpio}.pdf"


# =============================================================================
# CREAR EL PDF
# =============================================================================
def generar(datos, carpeta=CARPETA_FACTURAS):
    """Crea el PDF y devuelve su ruta (Path)."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_RIGHT
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        raise ErrorPDF("Falta instalar la librería de PDF. En la terminal ejecuta:\n"
                       "py -3.13 -m pip install reportlab") from None

    f = datos["factura"]
    lineas = datos["lineas"]
    pagos = datos["pagos"]
    anulada = (f.get("estado") or "").strip().lower() == "anulada"

    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / _nombre_archivo(f["numero"])

    # ---------- Estilos de texto ----------
    def estilo(nombre, **k):
        base = dict(fontName="Helvetica", fontSize=9.5, leading=13, textColor=colors.HexColor(GRIS_OSCURO))
        base.update(k)
        return ParagraphStyle(nombre, **base)

    marca = estilo("marca", fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=colors.HexColor(VERDE))
    gris = estilo("gris", textColor=colors.HexColor(GRIS_TEXTO), fontSize=9, leading=12)
    titulo = estilo("titulo", fontName="Helvetica-Bold", fontSize=18, leading=22, alignment=TA_RIGHT)
    derecha = estilo("derecha", alignment=TA_RIGHT)
    derecha_gris = estilo("derecha_gris", alignment=TA_RIGHT, textColor=colors.HexColor(GRIS_TEXTO), fontSize=9)
    etiqueta = estilo("etiqueta", fontName="Helvetica-Bold", fontSize=8, leading=10,
                      textColor=colors.HexColor(GRIS_TEXTO))
    etiqueta_der = estilo("etiqueta_der", fontName="Helvetica-Bold", fontSize=8, leading=10,
                          textColor=colors.HexColor(GRIS_TEXTO), alignment=TA_RIGHT)
    normal = estilo("normal")
    negrita = estilo("negrita", fontName="Helvetica-Bold")
    total_estilo = estilo("total", fontName="Helvetica-Bold", fontSize=13, leading=16, alignment=TA_RIGHT)
    pie = estilo("pie", fontSize=8, leading=11, textColor=colors.HexColor(GRIS_TEXTO))

    ancho = letter[0] - 36 * mm      # ancho útil (márgenes de 18 mm)
    partes = []

    # ---------- Encabezado: gimnasio a la izquierda, número de factura a la derecha ----------
    datos_sucursal = [f"Sucursal {_texto(f['sucursal'])}"]
    if f.get("direccion"):
        datos_sucursal.append(_texto(f["direccion"]))
    if f.get("telefono"):
        datos_sucursal.append(f"Tel. {_texto(f['telefono'])}")

    izquierda = [Paragraph(NOMBRE_GIMNASIO, marca), Paragraph(_texto(LEMA), gris),
                 Spacer(1, 4), Paragraph("<br/>".join(datos_sucursal), gris)]
    derecha_bloque = [Paragraph("FACTURA", titulo),
                      Paragraph(f"N° <b>{_texto(f['numero'])}</b>", derecha),
                      Paragraph(f["fecha_emision"].strftime("%d/%m/%Y %H:%M") if f.get("fecha_emision") else "",
                                derecha_gris)]
    if anulada:
        derecha_bloque.append(Paragraph('<font color="#dc2626"><b>ANULADA</b></font>', derecha))

    encabezado = Table([[izquierda, derecha_bloque]], colWidths=[ancho * 0.6, ancho * 0.4])
    encabezado.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, 0), 2, colors.HexColor(VERDE)),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
    ]))
    partes += [encabezado, Spacer(1, 12)]

    # ---------- Datos del cliente ----------
    cliente = Table([
        [Paragraph("CLIENTE", etiqueta), Paragraph("DPI / NIT", etiqueta), Paragraph("ATENDIÓ", etiqueta)],
        [Paragraph(_texto(f["cliente"]), negrita), Paragraph(_texto(f.get("nit_dpi")), normal),
         Paragraph(_texto(f.get("atendido_por") or "—"), normal)],
    ], colWidths=[ancho * 0.45, ancho * 0.25, ancho * 0.30])
    cliente.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(GRIS_FONDO)),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(GRIS_LINEA)),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    partes += [cliente, Spacer(1, 16)]

    # ---------- Detalle ----------
    filas = [[Paragraph("DESCRIPCIÓN", etiqueta), Paragraph("CANT.", etiqueta_der),
              Paragraph("PRECIO UNIT.", etiqueta_der), Paragraph("SUBTOTAL", etiqueta_der)]]
    for linea in lineas:
        subtotal = linea.get("subtotal")
        if subtotal is None:
            subtotal = linea["cantidad"] * linea["precio_unitario"]
        filas.append([Paragraph(_texto(linea["descripcion"]), normal),
                      Paragraph(str(linea["cantidad"]), derecha),
                      Paragraph(_dinero(linea["precio_unitario"]), derecha),
                      Paragraph(_dinero(subtotal), derecha)])
    if len(filas) == 1:
        filas.append([Paragraph("(sin líneas)", gris), "", "", ""])

    detalle = Table(filas, colWidths=[ancho * 0.55, ancho * 0.1, ancho * 0.17, ancho * 0.18], repeatRows=1)
    estilos_detalle = [
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor(GRIS_OSCURO)),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor(GRIS_LINEA)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(2, len(filas), 2):                       # filas alternas en gris claro
        estilos_detalle.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor(GRIS_FONDO)))
    detalle.setStyle(TableStyle(estilos_detalle))
    partes += [detalle, Spacer(1, 10)]

    # ---------- Total ----------
    total = Table([["", Paragraph("TOTAL", total_estilo), Paragraph(_dinero(f["total"]), total_estilo)]],
                  colWidths=[ancho * 0.55, ancho * 0.2, ancho * 0.25])
    total.setStyle(TableStyle([
        ("LINEABOVE", (1, 0), (-1, 0), 1.5, colors.HexColor(VERDE)),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    partes += [total, Spacer(1, 14)]

    # ---------- Forma de pago ----------
    if pagos:
        texto_pagos = []
        for p in pagos:
            renglon = f"{_texto(p['metodo'])}: <b>{_dinero(p['monto'])}</b>"
            if p.get("referencia"):
                renglon += f"  (ref. {_texto(p['referencia'])})"
            texto_pagos.append(renglon)
        partes += [Paragraph("FORMA DE PAGO", etiqueta), Spacer(1, 3), Paragraph("<br/>".join(texto_pagos), normal)]

    # ---------- Pie de página (en cada hoja) ----------
    def dibujar_pie(lienzo, documento):
        lienzo.saveState()
        lienzo.setFont("Helvetica", 8)
        lienzo.setFillColor(colors.HexColor(GRIS_TEXTO))
        centro = letter[0] / 2
        lienzo.drawCentredString(centro, 17 * mm, "¡Gracias por entrenar con nosotros!")
        lienzo.drawCentredString(centro, 13 * mm, "Comprobante interno de FitManager. "
                                                  "No sustituye a la Factura Electrónica en Línea (FEL) de la SAT.")
        lienzo.drawCentredString(centro, 9 * mm,
                                 f"Generado el {datetime.now():%d/%m/%Y %H:%M}  ·  página {documento.page}")
        lienzo.restoreState()

    def escribir(destino):
        documento = SimpleDocTemplate(str(destino), pagesize=letter,
                                      leftMargin=18 * mm, rightMargin=18 * mm,
                                      topMargin=16 * mm, bottomMargin=24 * mm,
                                      title=f"Factura {f['numero']}", author=NOMBRE_GIMNASIO)
        documento.build(list(partes), onFirstPage=dibujar_pie, onLaterPages=dibujar_pie)

    try:
        escribir(ruta)
    except PermissionError:
        # El PDF anterior está abierto en el lector (Windows no deja reemplazarlo): se usa otro nombre
        ruta = carpeta / f"{ruta.stem}_{datetime.now():%H%M%S}.pdf"
        escribir(ruta)
    return ruta


# =============================================================================
# ABRIR O IMPRIMIR
# =============================================================================
def abrir(ruta):
    """Abre el PDF con el programa predeterminado (Edge, Acrobat...)."""
    try:
        if sys.platform.startswith("win"):
            os.startfile(str(ruta))                       # solo existe en Windows
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(ruta)])
        else:
            subprocess.Popen(["xdg-open", str(ruta)])
    except OSError:
        raise ErrorPDF(f"El PDF se guardó, pero no hay un programa para abrirlo:\n{ruta}") from None


def imprimir(ruta):
    """Manda el PDF directo a la impresora predeterminada.
    Devuelve False si no se pudo (entonces conviene abrirlo para imprimir desde el lector)."""
    if not sys.platform.startswith("win"):
        return False
    try:
        os.startfile(str(ruta), "print")
        return True
    except OSError:                                        # el lector de PDF no permite imprimir así
        return False
