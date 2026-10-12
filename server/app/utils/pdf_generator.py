import io
from typing import Any, Dict, List

from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def _build_ticket_page(
    ticket: Dict[str, Any],
    booking: Dict[str, Any],
    pass_index: int,
    total_passes: int,
    styles: Any,
) -> List[Any]:
    """
    Renders elements for a single official entrance pass page.
    """
    elements = []

    title_style = ParagraphStyle(
        f"Title_{pass_index}",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#4c1d95"),
        alignment=1,
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        f"Subtitle_{pass_index}",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#b45309"),
        alignment=1,
        spaceAfter=8,
    )

    pass_index_style = ParagraphStyle(
        f"PassIndex_{pass_index}",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        alignment=1,
        spaceAfter=10,
    )

    label_style = ParagraphStyle(
        f"Label_{pass_index}",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#475569"),
    )

    value_style = ParagraphStyle(
        f"Value_{pass_index}",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
    )

    badge_style = ParagraphStyle(
        f"Badge_{pass_index}",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#15803d"),
    )

    qr_label_style = ParagraphStyle(
        f"QRLabel_{pass_index}",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#4338ca"),
        alignment=1,
        spaceAfter=4,
    )

    qr_token_style = ParagraphStyle(
        f"QRToken_{pass_index}",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=10,
        textColor=colors.HexColor("#64748b"),
        alignment=1,
    )

    footer_style = ParagraphStyle(
        f"Footer_{pass_index}",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748b"),
        alignment=1,
    )

    # 1. Header
    elements.append(
        Paragraph("Online Garba Ticketing System 2026", title_style)
    )
    elements.append(
        Paragraph("OFFICIAL GARBA ENTRANCE PASS", subtitle_style)
    )
    elements.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=colors.HexColor("#7e22ce"),
            spaceAfter=8,
        )
    )

    # 2. Pass Indicator
    ticket_num = str(ticket.get("ticket_number") or f"{booking['booking_id']}-{pass_index:02d}")
    elements.append(
        Paragraph(
            f"PASS {pass_index} OF {total_passes} &nbsp;&bull;&nbsp; SERIAL: <font color='#6b21a8'>{ticket_num}</font>",
            pass_index_style,
        )
    )

    # 3. Details Table
    ticket_price = float(booking.get("ticket_price", 200.00))
    table_data = [
        [
            Paragraph("Event:", label_style),
            Paragraph("Online Garba Ticketing System 2026", value_style),
        ],
        [
            Paragraph("Event Date:", label_style),
            Paragraph(str(ticket.get("event_date") or booking.get("event_date")), value_style),
        ],
        [
            Paragraph("Venue:", label_style),
            Paragraph(str(booking.get("venue", "Bardoli Ground")), value_style),
        ],
        [
            Paragraph("Pass Serial:", label_style),
            Paragraph(f"<b>{ticket_num}</b>", value_style),
        ],
        [
            Paragraph("Booking Ref:", label_style),
            Paragraph(str(booking.get("booking_id")), value_style),
        ],
        [
            Paragraph("Price:", label_style),
            Paragraph(f"Rs. {ticket_price:.2f}", value_style),
        ],
        [
            Paragraph("Payment Status:", label_style),
            Paragraph("<b>PAID & CONFIRMED</b>", badge_style),
        ],
        [
            Paragraph("Pass Status:", label_style),
            Paragraph("<b>VALID FOR SINGLE ENTRY</b>", badge_style),
        ],
    ]

    table = Table(table_data, colWidths=[130, 370])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("PADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    elements.append(table)
    elements.append(Spacer(1, 14))

    # 4. Entry QR Code (QR System 2)
    token = str(ticket.get("ticket_token") or ticket_num)
    qr_widget = QrCodeWidget(token)
    bounds = qr_widget.getBounds()
    w = bounds[2] - bounds[0]
    h = bounds[3] - bounds[1]
    scale_w = 140 / w if w else 1
    scale_h = 140 / h if h else 1

    d = Drawing(140, 140, transform=[scale_w, 0, 0, scale_h, 0, 0])
    d.add(qr_widget)
    d.hAlign = "CENTER"

    qr_box_data = [
        [Paragraph("ENTRY VERIFICATION QR CODE", qr_label_style)],
        [d],
        [Spacer(1, 4)],
        [Paragraph(f"Token: {token}", qr_token_style)],
        [Paragraph("Present this QR at security entrance gate for scanning", qr_token_style)],
    ]
    qr_box = Table(qr_box_data, colWidths=[500])
    qr_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f5f3ff")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#c4b5fd")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    elements.append(qr_box)
    elements.append(Spacer(1, 14))

    # 5. Instructions / Disclaimer
    elements.append(
        Paragraph(
            "Security Notice: Each ticket pass contains a unique QR code valid for one person "
            "and a single entry on the specified event date at Bardoli Ground. Once scanned at "
            "the gate, this pass is permanently marked as used and cannot be reused or transferred.",
            footer_style,
        )
    )

    return elements


def _build_pending_payment_page(
    booking: Dict[str, Any],
    styles: Any,
) -> List[Any]:
    """
    Renders a clear pending payment receipt when passes are not yet confirmed.
    No valid entrance QR codes are issued until payment is marked PAID.
    """
    elements = []

    title_style = ParagraphStyle(
        "PendingTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#b91c1c"),
        alignment=1,
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        "PendingSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#b45309"),
        alignment=1,
        spaceAfter=10,
    )

    label_style = ParagraphStyle(
        "PendingLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
    )

    value_style = ParagraphStyle(
        "PendingValue",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
    )

    pending_badge = ParagraphStyle(
        "PendingBadge",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#d97706"),
    )

    warning_text = ParagraphStyle(
        "WarningText",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#991b1b"),
        alignment=1,
    )

    elements.append(Paragraph("Online Garba Ticketing System 2026", title_style))
    elements.append(Paragraph("BOOKING ORDER RECEIPT — PAYMENT PENDING", subtitle_style))
    elements.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=colors.HexColor("#ef4444"),
            spaceAfter=14,
        )
    )

    warning_box = Table(
        [
            [Paragraph("PAYMENT PENDING &bull; NOT VALID FOR GATE ENTRY", warning_text)],
            [Spacer(1, 4)],
            [
                Paragraph(
                    "This booking has not yet been paid. Individual entrance passes and entry QR codes "
                    "will only be issued after payment is received at the ticket counter or verified via online gateway.",
                    ParagraphStyle(
                        "WarnSub",
                        parent=styles["Normal"],
                        fontName="Helvetica",
                        fontSize=9,
                        leading=13,
                        textColor=colors.HexColor("#7f1d1d"),
                        alignment=1,
                    ),
                )
            ],
        ],
        colWidths=[500],
    )
    warning_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fef2f2")),
                ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor("#fca5a5")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("PADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    elements.append(warning_box)
    elements.append(Spacer(1, 16))

    price = float(booking.get("ticket_price", 200.00))
    total = float(booking.get("total_amount", price * int(booking.get("quantity", 1))))

    table_data = [
        [Paragraph("Booking ID:", label_style), Paragraph(str(booking["booking_id"]), value_style)],
        [Paragraph("Event Date:", label_style), Paragraph(str(booking["event_date"]), value_style)],
        [Paragraph("Venue:", label_style), Paragraph(str(booking.get("venue", "Bardoli Ground")), value_style)],
        [Paragraph("Passes Reserved:", label_style), Paragraph(str(booking["quantity"]), value_style)],
        [Paragraph("Price per Pass:", label_style), Paragraph(f"Rs. {price:.2f}", value_style)],
        [Paragraph("Total Amount Due:", label_style), Paragraph(f"<b>Rs. {total:.2f}</b>", value_style)],
        [Paragraph("Payment Method:", label_style), Paragraph(str(booking.get("payment_method", "CASH")).upper(), value_style)],
        [Paragraph("Payment Status:", label_style), Paragraph("<b>PENDING PAYMENT</b>", pending_badge)],
    ]
    table = Table(table_data, colWidths=[140, 360])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("PADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    elements.append(table)
    return elements


def generate_ticket_pdf(booking: dict) -> bytes:
    """
    Generate a PDF ticket document using persisted booking data.
    - If payment is 'paid', generates a multi-page document with 1 page per individual entrance pass,
      each rendering its unique QR System 2 entry QR code.
    - If payment is 'pending', generates a pending receipt notice with no gate QR code.
    """
    required_fields = [
        "booking_id",
        "venue",
        "event_date",
        "quantity",
        "ticket_price",
        "total_amount",
        "payment_method",
        "payment_status",
    ]

    missing_fields = [
        field for field in required_fields if booking.get(field) is None
    ]
    if missing_fields:
        raise ValueError(
            f"Missing required booking fields: {', '.join(missing_fields)}"
        )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=36,
        bottomMargin=36,
        pageCompression=0,
    )

    styles = getSampleStyleSheet()
    elements: List[Any] = []

    is_paid = str(booking.get("payment_status", "")).lower() in ("paid", "confirmed", "completed")
    tickets: List[Dict[str, Any]] = booking.get("tickets") or []
    quantity = int(booking.get("quantity", 1))

    if is_paid:
        # If tickets list is empty, generate single fallback pass or synthesized tickets
        if not tickets:
            tickets = [
                {
                    "ticket_number": f"{booking['booking_id']}-{i:02d}",
                    "ticket_token": f"OGTS-TKT-{booking['booking_id']}-{i:02d}",
                    "event_date": booking["event_date"],
                    "status": "valid",
                    "entry_status": "unused",
                }
                for i in range(1, quantity + 1)
            ]

        for idx, ticket in enumerate(tickets, start=1):
            page_elements = _build_ticket_page(
                ticket=ticket,
                booking=booking,
                pass_index=idx,
                total_passes=len(tickets),
                styles=styles,
            )
            elements.extend(page_elements)
            if idx < len(tickets):
                elements.append(PageBreak())
    else:
        elements.extend(_build_pending_payment_page(booking=booking, styles=styles))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes