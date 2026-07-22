from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from app.extensions import db
from app.models.meal import Meal
from app.models.user_goals import UserGoals

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # O relacionamento 1:N (Um usuário tem várias refeições)
    meals = db.relationship('Meal', backref='user', lazy=True, cascade="all, delete-orphan")
    # Relação um-para-um com as metas do usuário.
    goals = db.relationship('UserGoals', backref='user', uselist=False, cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)