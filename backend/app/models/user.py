from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from app.extensions import db

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # --- NOVAS COLUNAS: Metas do Usuário ---
    goal_calories = db.Column(db.Float, default=2000.0)
    goal_protein_g = db.Column(db.Float, default=150.0)
    goal_carbs_g = db.Column(db.Float, default=200.0)
    goal_fat_g = db.Column(db.Float, default=60.0)

    # O relacionamento 1:N (Um usuário tem várias refeições)
    meals = db.relationship('Meal', backref='author', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)