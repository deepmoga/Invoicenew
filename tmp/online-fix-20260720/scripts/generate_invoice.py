import base64, io, json, sys
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether

data = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Right", parent=styles["Normal"], alignment=TA_RIGHT, leading=15))
styles.add(ParagraphStyle(name="Company", parent=styles["Heading2"], fontSize=17, leading=21, spaceAfter=7))
styles.add(ParagraphStyle(name="InvoiceTitle", parent=styles["Heading1"], fontSize=25, leading=28, alignment=TA_RIGHT))
styles.add(ParagraphStyle(name="SmallMuted", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#667085"), leading=11))
styles.add(ParagraphStyle(name="FooterNote", parent=styles["Normal"], fontSize=8, alignment=TA_CENTER, textColor=colors.HexColor("#667085")))

def text(value):
    return str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def money(value):
    return "Rs. {:,.2f}".format(float(value or 0))

def bullet_list(value):
    lines = [line.strip() for line in str(value or "").replace("\r", "").split("\n") if line.strip()]
    if not lines:
        return ""
    return "<br/>".join("&bull;&nbsp; " + text(line) for line in lines)

document_type = (data.get("document_type") or "INVOICE").upper()
document_date = data.get("invoice_date") or data.get("estimate_date")
doc = SimpleDocTemplate(out, pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm, title=f"{data.get('customer_business') or data.get('customer_name')} {document_date}")
story = []
company_parts = []
logo = data.get("logo") or ""
if logo.startswith("data:image"):
    try:
        raw = base64.b64decode(logo.split(",", 1)[1])
        img = Image(io.BytesIO(raw), width=34*mm, height=15*mm, kind="proportional")
        company_parts.extend([img, Spacer(1, 3*mm)])
    except Exception:
        pass
company_parts.extend([
    Paragraph(text(data.get("company_name")), styles["Company"]),
    Paragraph(text(data.get("company_address")), styles["Normal"]),
    Paragraph(" ".join(filter(None, [text(data.get("company_email")), text(data.get("company_phone"))])), styles["Normal"]),
])
if data.get("company_gstin"):
    company_parts.append(Paragraph("GSTIN: " + text(data["company_gstin"]), styles["Normal"]))
right = [Paragraph(document_type, styles["InvoiceTitle"]), Paragraph(f"<b>{text(data.get('number'))}</b>", styles["Right"]), Spacer(1, 4*mm), Paragraph(f"Date: {text(document_date)}<br/>Valid until: {text(data.get('due_date'))}", styles["Right"])]
head = Table([[company_parts, right]], colWidths=[110*mm, 48*mm])
head.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0)]))
story.extend([head, Spacer(1, 18*mm)])

customer = data.get("customer_business") or data.get("customer_name")
bill = [Paragraph("BILL TO", styles["SmallMuted"]), Spacer(1, 2*mm), Paragraph(f"<b>{text(customer)}</b>", styles["Heading3"]), Paragraph(text(data.get("customer_name")), styles["Normal"]), Paragraph(text(data.get("customer_address")), styles["Normal"])]
if data.get("customer_gstin"):
    bill.append(Paragraph("GSTIN: " + text(data["customer_gstin"]), styles["Normal"]))
po = []
if data.get("po_number"):
    po = [Paragraph("PURCHASE ORDER", styles["SmallMuted"]), Paragraph(text(data["po_number"]), styles["Right"])]
party = Table([[bill, po]], colWidths=[110*mm, 48*mm])
party.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0)]))
story.extend([party, Spacer(1, 14*mm)])

rows = [["ITEM", "QTY", "PRICE", "AMOUNT"]]
for line in data.get("lines", []):
    description = bullet_list(line.get("description"))
    item = Paragraph(f"<b>{text(line.get('name'))}</b>{'<br/><font size=\'8\' color=\'#667085\'>'+description+'</font>' if description else ''}", styles["Normal"])
    rows.append([item, str(line.get("quantity") or 0), money(line.get("price")), money(line.get("amount"))])
items = Table(rows, colWidths=[82*mm, 20*mm, 28*mm, 28*mm], repeatRows=1)
items.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#F0F4FA")),("TEXTCOLOR",(0,0),(-1,0),colors.HexColor("#475467")),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,0),8),("ALIGN",(1,0),(-1,-1),"RIGHT"),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9),("LINEBELOW",(0,0),(-1,0),0.5,colors.HexColor("#DDE3EC"))]))
story.extend([items, Spacer(1, 9*mm)])

totals = [["Subtotal", money(data.get("subtotal"))]]
if data.get("gst_enabled"):
    rate = (data.get("lines") or [{}])[0].get("gst_rate", 0)
    totals.append([f"GST ({rate}%)", money(data.get("tax_total"))])
totals.append(["Total due", money(data.get("total"))])
total_table = Table(totals, colWidths=[40*mm, 38*mm], hAlign="RIGHT")
commands = [("ALIGN",(0,0),(-1,-1),"RIGHT"),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"),("FONTSIZE",(0,-1),(-1,-1),13),("LINEABOVE",(0,-1),(-1,-1),1,colors.HexColor("#101828"))]
total_table.setStyle(TableStyle(commands))
story.append(total_table)
if data.get("notes"):
    story.extend([Spacer(1, 10*mm), Paragraph("<b>Notes</b>", styles["Normal"]), Paragraph(bullet_list(data["notes"]), styles["Normal"])])
if data.get("bank_details"):
    story.extend([Spacer(1, 6*mm), Paragraph("<b>Payment details</b>", styles["Normal"]), Paragraph(text(data["bank_details"]), styles["Normal"])])
footer = "This is a computer-generated estimate and does not require a signature." if document_type == "ESTIMATE" else "This is a computer-generated invoice and does not require a signature."
story.extend([Spacer(1, 18*mm), Paragraph(footer, styles["FooterNote"])])
doc.build(story)
