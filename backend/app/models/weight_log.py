from app.extensions import db
from datetime import datetime

class WeightLog(db.Model):
    __tablename__ = 'weight_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    weight = db.Column(db.Float, nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "weight": self.weight,
            "date": self.date.strftime("%Y-%m-%d")
        }