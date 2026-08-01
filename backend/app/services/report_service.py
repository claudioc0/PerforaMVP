import csv
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models import WeightLog
from app.services.meal_service import MealService
from app.services.workout_service import WorkoutService

WORKOUT_PROGRESS_LIMIT = 10


def build_report_data(user_id: int) -> dict:
    """Reúne os três conjuntos de dados já calculados em outro lugar (resumo
    semanal, histórico de peso, progresso de treino) num único dict pronto
    pra virar PDF ou CSV. Não recalcula nada — reaproveita a mesma lógica de
    agregação já usada pelas rotas GET correspondentes (MealService,
    WorkoutService, WeightLog), pra não duplicar regra de negócio.

    MealService(None): a fábrica de GeminiService só é construída se
    analyze_image/analyze_text forem chamados de verdade (ver
    MealService._gemini_service) — get_weekly_summary nunca toca nisso.
    """
    weekly_summary = MealService(None).get_weekly_summary(user_id)

    weight_logs = (
        WeightLog.query
        .filter_by(user_id=user_id)
        .order_by(WeightLog.log_date.asc())
        .all()
    )
    weight_history = [log.to_dict() for log in weight_logs]

    workout_progress = WorkoutService().get_workout_progress(user_id, limit=WORKOUT_PROGRESS_LIMIT)

    return {
        "weekly_summary": weekly_summary["days"],
        "weight_history": weight_history,
        "workout_progress": workout_progress,
    }


def render_csv(data: dict) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["Resumo Semanal"])
    writer.writerow(["Data", "Dia", "Calorias", "Proteína (g)"])
    for day in data["weekly_summary"]:
        writer.writerow([day["date"], day["day_name"], day["calories"], day["protein_g"]])
    writer.writerow([])

    writer.writerow(["Histórico de Peso"])
    writer.writerow(["Data", "Peso (kg)"])
    for entry in data["weight_history"]:
        writer.writerow([entry["date"], entry["weight"]])
    writer.writerow([])

    writer.writerow([f"Progresso de Treino (últimos {WORKOUT_PROGRESS_LIMIT})"])
    writer.writerow(["Treino", "Data", "Tonelagem (kg)", "Repetições", "Descanso Médio (s)"])
    for workout in data["workout_progress"]:
        writer.writerow([
            workout["name"],
            workout["started_at"],
            workout["total_tonnage"],
            workout["total_reps"],
            workout["avg_rest_seconds"] if workout["avg_rest_seconds"] is not None else "",
        ])

    return output.getvalue()


def _styled_table(rows: list) -> Table:
    table = Table(rows, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#00FF66")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
    ]))
    return table


def render_pdf(data: dict, user_name: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"Relatório Perfora — {user_name}", styles["Title"]))
    elements.append(Paragraph(f"Gerado em {datetime.utcnow().strftime('%d/%m/%Y')}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    elements.append(Paragraph("Resumo Semanal", styles["Heading2"]))
    weekly_rows = [["Data", "Dia", "Calorias", "Proteína (g)"]]
    for day in data["weekly_summary"]:
        weekly_rows.append([day["date"], day["day_name"], f"{day['calories']:.0f}", f"{day['protein_g']:.1f}"])
    elements.append(_styled_table(weekly_rows))
    elements.append(Spacer(1, 20))

    elements.append(Paragraph("Histórico de Peso", styles["Heading2"]))
    if data["weight_history"]:
        weight_rows = [["Data", "Peso (kg)"]]
        for entry in data["weight_history"]:
            weight_rows.append([entry["date"], f"{entry['weight']:.1f}"])
        elements.append(_styled_table(weight_rows))
    else:
        elements.append(Paragraph("Nenhum registro de peso ainda.", styles["Normal"]))
    elements.append(Spacer(1, 20))

    elements.append(Paragraph(f"Progresso de Treino (últimos {WORKOUT_PROGRESS_LIMIT})", styles["Heading2"]))
    if data["workout_progress"]:
        workout_rows = [["Treino", "Data", "Tonelagem (kg)", "Repetições", "Descanso Médio (s)"]]
        for workout in data["workout_progress"]:
            rest = f"{workout['avg_rest_seconds']:.0f}" if workout["avg_rest_seconds"] is not None else "—"
            workout_rows.append([
                workout["name"],
                workout["started_at"][:10],
                f"{workout['total_tonnage']:.1f}",
                str(workout["total_reps"]),
                rest,
            ])
        elements.append(_styled_table(workout_rows))
    else:
        elements.append(Paragraph("Nenhum treino finalizado ainda.", styles["Normal"]))

    doc.build(elements)
    return buffer.getvalue()
