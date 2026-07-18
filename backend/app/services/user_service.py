import logging
from typing import Optional
from datetime import datetime

from app.extensions import db
from app.models import User, UserGoals, WaterLog
from sqlalchemy import func

logger = logging.getLogger(__name__)

class UserService:
    """
    Camada de serviço para orquestrar operações relacionadas ao usuário,
    como gerenciamento de metas e cálculos nutricionais.
    """

    def get_user_goals(self, user_id: int) -> Optional[UserGoals]:
        """Busca as metas de um usuário. Retorna None se o usuário não for encontrado."""
        user = User.query.get(user_id)
        return user.goals if user else None

    def update_user_goals(self, user_id: int, goals_data: dict) -> Optional[User]:
        """
        Atualiza as metas nutricionais de um usuário.
        Cria um registro de metas se ele não existir.
        """
        user = User.query.get(user_id)
        if not user:
            return None

        if not user.goals:
            user.goals = UserGoals(user_id=user_id)
            db.session.add(user.goals)

        user.goals.goal_calories = goals_data.get('goal_calories', user.goals.goal_calories)
        user.goals.goal_protein_g = goals_data.get('goal_protein_g', user.goals.goal_protein_g)
        user.goals.goal_carbs_g = goals_data.get('goal_carbs_g', user.goals.goal_carbs_g)
        user.goals.goal_fat_g = goals_data.get('goal_fat_g', user.goals.goal_fat_g)

        db.session.commit()
        return user

    def calculate_and_save_smart_goals(self, user_id: int, physical_data: dict) -> Optional[UserGoals]:
        """
        Calcula as metas (TDEE e macros) com base nos dados físicos e as salva para o usuário.
        """
        # 1. Extrair e validar dados de entrada
        weight = physical_data.get("weight")
        height = physical_data.get("height")
        age = physical_data.get("age")
        gender = physical_data.get("gender")
        activity_level = physical_data.get("activity_level")
        goal = physical_data.get("goal")

        if not all([weight, height, age, gender, activity_level, goal]):
            raise ValueError("Dados físicos incompletos para o cálculo de metas.")

        # 2. Calcular TMB (Taxa Metabólica Basal) - Fórmula de Mifflin-St Jeor
        if gender == 'M':
            tmb = (10 * weight) + (6.25 * height) - (5 * age) + 5
        else:  # 'F'
            tmb = (10 * weight) + (6.25 * height) - (5 * age) - 161

        # 3. Calcular TDEE (Gasto Energético Diário Total)
        tdee = tmb * activity_level

        # 4. Ajustar calorias com base no objetivo
        if goal == 'lose':
            calorie_goal = tdee - 500  # Déficit de 500 kcal
        elif goal == 'gain':
            calorie_goal = tdee + 500  # Superávit de 500 kcal
        else:  # 'maintain'
            calorie_goal = tdee

        # 5. Calcular Macronutrientes
        # Proteína: 2g por kg de peso corporal (padrão para quem treina)
        protein_g = 2.0 * weight
        protein_calories = protein_g * 4

        # Gordura: 25% do total calórico
        fat_calories = calorie_goal * 0.25
        fat_g = fat_calories / 9

        # Carboidratos: o que sobrar
        carb_calories = calorie_goal - protein_calories - fat_calories
        carbs_g = carb_calories / 4

        # 6. Montar o objeto de metas e salvar no banco
        new_goals_data = {
            "goal_calories": round(calorie_goal),
            "goal_protein_g": round(protein_g),
            "goal_carbs_g": round(carbs_g),
            "goal_fat_g": round(fat_g),
        }

        updated_user = self.update_user_goals(user_id, new_goals_data)

        if not updated_user:
            return None

        return updated_user.goals

    def add_water_intake(self, user_id: int, amount: int) -> int:
        """
        Registra uma nova ingestão de água e retorna o total do dia.
        """
        # 1. Cria o novo registro
        new_log = WaterLog(user_id=user_id, amount_ml=amount)
        db.session.add(new_log)
        
        # 2. Calcula o total do dia
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=999999)

        total_today_query = db.session.query(
            func.sum(WaterLog.amount_ml)
        ).filter(
            WaterLog.user_id == user_id,
            WaterLog.created_at.between(today_start, today_end)
        )
        
        db.session.commit() # Salva o novo registro

        # Executa a query de soma após o commit para incluir o novo valor
        total_today = total_today_query.scalar() or 0
        return total_today