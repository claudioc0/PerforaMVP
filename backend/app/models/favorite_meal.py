from app.extensions import db

class FavoriteMeal(db.Model):
    __tablename__ = 'favorite_meals'

    id = db.Column(db.Integer, primary_key=True)
    # get_favorites (agora paginado) filtra por user_id em toda chamada — sem
    # índice, tanto o COUNT quanto o LIMIT/OFFSET varrem a tabela inteira.
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    description = db.Column(db.String(255), nullable=False)
    calories = db.Column(db.Float, nullable=False)
    protein_g = db.Column(db.Float, nullable=False)
    carbs_g = db.Column(db.Float, nullable=False)
    fat_g = db.Column(db.Float, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "description": self.description,
            "calories": self.calories,
            "protein_g": self.protein_g,
            "carbs_g": self.carbs_g,
            "fat_g": self.fat_g
        }