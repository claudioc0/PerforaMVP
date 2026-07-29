from datetime import datetime

from app.extensions import db


class ProgressPhoto(db.Model):
    """Uma foto de progresso físico do usuário (mesmo ângulo, ao longo do
    tempo — não uma galeria solta). Uma por dia, mesma regra de WeightLog:
    o objetivo é comparar a MESMA referência dia a dia, não acumular fotos
    aleatórias sem cadência nenhuma.
    """

    __tablename__ = "progress_photos"
    __table_args__ = (
        db.UniqueConstraint("user_id", "taken_at", name="uq_progress_photos_user_taken_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    # Toda listagem filtra por user_id — sem índice, cresce como uma
    # varredura completa conforme o histórico de fotos acumula (mesmo
    # raciocínio de WeightLog.user_id/Meal.user_id).
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    # Nome do arquivo em disco (dentro de PROGRESS_PHOTOS_FOLDER), não o
    # caminho completo — o caminho é montado em runtime a partir da config,
    # pra não engessar um valor absoluto de uma máquina específica no banco.
    filename = db.Column(db.String(255), nullable=False)
    taken_at = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "taken_at": self.taken_at.strftime("%Y-%m-%d"),
            # Aponta pra rota autenticada de servir a imagem, não um caminho
            # de arquivo cru — a foto é conteúdo privado do usuário, servida
            # só mediante o próprio JWT dele (ver GET .../image em user_routes.py).
            # SEM o prefixo /api: EXPO_PUBLIC_API_URL no frontend já inclui
            # esse prefixo (ver api.js), então incluí-lo aqui de novo duplicaria
            # o caminho (.../api/api/user/...) na hora de montar a URL completa.
            "image_url": f"/user/progress-photos/{self.id}/image",
        }
