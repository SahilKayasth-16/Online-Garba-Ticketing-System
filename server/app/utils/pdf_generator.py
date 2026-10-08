import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def generate_ticket_pdf(booking: dict) -> bytes:
    """
    Generate a PDF ticket using persisted booking data.

    No demo or fallback transactional values are used.
    Required booking fields must be present in the supplied record.
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
        field
        for field in required_fields
        if booking.get(field) is None
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
        topMargin=40,
        bottomMargin=40,
        pageCompression=0,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "TicketTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#4c1d95"),
        alignment=1,
        spaceAfter=6,
    )

    subtitle_style = ParagraphStyle(
        "TicketSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#b45309"),
        alignment=1,
        spaceAfter=15,
    )

    ref_style = ParagraphStyle(
        "BookingRef",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#1e293b"),
        alignment=1,
        spaceAfter=15,
    )

    label_style = ParagraphStyle(
        "LabelStyle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
    )

    value_style = ParagraphStyle(
        "ValueStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
    )

    badge_style = ParagraphStyle(
        "BadgeStyle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#15803d"),
        alignment=0,
    )

    footer_style = ParagraphStyle(
        "Footer",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748b"),
        alignment=1,
    )

    elements = []

    # Event branding is static presentation content.
    elements.append(
        Paragraph(
            "Online Garba Ticketting System 2026",
            title_style,
        )
    )

    elements.append(
        Paragraph(
            "OFFICIAL GARBA TICKET PASS",
            subtitle_style,
        )
    )

    elements.append(
        HRFlowable(
            width="100%",
            thickness=2,
            color=colors.HexColor("#7e22ce"),
            spaceAfter=15,
        )
    )

    booking_id = str(booking["booking_id"])

    elements.append(
        Paragraph(
            f"BOOKING ID: <font color='#6b21a8'>{booking_id}</font>",
            ref_style,
        )
    )

    elements.append(Spacer(1, 5))

    event_date = str(booking["event_date"])
    venue = str(booking["venue"])
    quantity = str(booking["quantity"])
    price = f"Rs. {float(booking['ticket_price']):.2f}"
    total = f"Rs. {float(booking['total_amount']):.2f}"
    payment_method = str(booking["payment_method"]).upper()
    payment_status = str(booking["payment_status"]).upper()

    table_data = [
        [
            Paragraph("Event:", label_style),
            Paragraph(
                "Online Garba Ticketting System 2026",
                value_style,
            ),
        ],
        [
            Paragraph("Event Date:", label_style),
            Paragraph(event_date, value_style),
        ],
        [
            Paragraph("Venue:", label_style),
            Paragraph(venue, value_style),
        ],
        [
            Paragraph("Number of Passes:", label_style),
            Paragraph(quantity, value_style),
        ],
        [
            Paragraph("Price per Pass:", label_style),
            Paragraph(price, value_style),
        ],
        [
            Paragraph("Total Amount:", label_style),
            Paragraph(f"<b>{total}</b>", value_style),
        ],
        [
            Paragraph("Payment Method:", label_style),
            Paragraph(payment_method, value_style),
        ],
        [
            Paragraph("Payment Status:", label_style),
            Paragraph(
                f"<b>{payment_status}</b>",
                badge_style,
            ),
        ],
    ]

    table = Table(
        table_data,
        colWidths=[140, 360],
    )

    table.setStyle(
        TableStyle(
            [
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, -1),
                    colors.HexColor("#f8fafc"),
                ),
                (
                    "BOX",
                    (0, 0),
                    (-1, -1),
                    1,
                    colors.HexColor("#cbd5e1"),
                ),
                (
                    "INNERGRID",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    colors.HexColor("#e2e8f0"),
                ),
                (
                    "PADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),
                (
                    "VALIGN",
                    (0, 0),
                    (-1, -1),
                    "MIDDLE",
                ),
            ]
        )
    )

    elements.append(table)
    elements.append(Spacer(1, 20))

    # QR generation will be connected once the final ticket/QR
    # verification architecture is implemented.
    qr_message_style = ParagraphStyle(
        "QRMessage",
        parent=styles["Normal"],
        alignment=1,
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
    )

    qr_subtitle_style = ParagraphStyle(
        "QRSubtitle",
        parent=styles["Normal"],
        alignment=1,
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748b"),
    )

    qr_data = [
        [
            Paragraph(
                "Ticket verification will be available after QR integration.",
                qr_message_style,
            )
        ],
        [
            Paragraph(
                f"Booking Reference: {booking_id}",
                qr_subtitle_style,
            )
        ],
    ]

    qr_table = Table(
        qr_data,
        colWidths=[500],
    )

    qr_table.setStyle(
        TableStyle(
            [
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, -1),
                    colors.HexColor("#f1f5f9"),
                ),
                (
                    "BOX",
                    (0, 0),
                    (-1, -1),
                    1,
                    colors.HexColor("#94a3b8"),
                ),
                (
                    "ALIGN",
                    (0, 0),
                    (-1, -1),
                    "CENTER",
                ),
                (
                    "PADDING",
                    (0, 0),
                    (-1, -1),
                    12,
                ),
            ]
        )
    )

    elements.append(qr_table)
    elements.append(Spacer(1, 20))

    footer_text = (
        "This digital pass is generated for Professional Garba "
        "Navratri Mahotsav 2026. Present this pass at the "
        "venue gate upon arrival."
    )

    elements.append(
        Paragraph(
            footer_text,
            footer_style,
        )
    )

    doc.build(elements)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    return pdf_bytes