from app.extensions import db

class UserGoals(db.Model):
    """
    Modelo para armazenar as metas nutricionais de cada usuário.
    """
    __tablename__ = 'user_goals'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    
    goal_calories = db.Column(db.Float, nullable=False, default=2000)
    goal_protein_g = db.Column(db.Float, nullable=False, default=150)
    goal_carbs_g = db.Column(db.Float, nullable=False, default=200)
    goal_fat_g = db.Column(db.Float, nullable=False, default=60)

    # A relação de volta para o User é definida no modelo User

    def to_dict(self):
        return {
            'user_id': self.user_id,
            'goal_calories': self.goal_calories,
            'goal_protein_g': self.goal_protein_g,
            'goal_carbs_g': self.goal_carbs_g,
            'goal_fat_g': self.goal_fat_g,
        }