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

    # Assinatura premium remove o limite diário de análises de IA (ver
    # AiQuotaService). Ativação é manual por enquanto (sem processador de
    # pagamento integrado ainda) — ver plano/achado de freemium.
    is_premium = db.Column(db.Boolean, nullable=False, default=False)
    # Contador do dia corrente (UTC) de chamadas gratuitas de IA consumidas;
    # daily_ai_calls_date guarda a que dia esse contador se refere, pra
    # AiQuotaService saber quando resetar em vez de acumular pra sempre.
    daily_ai_calls_count = db.Column(db.Integer, nullable=False, default=0)
    daily_ai_calls_date = db.Column(db.Date, nullable=True)

    # O relacionamento 1:N (Um usuário tem várias refeições)
    meals = db.relationship('Meal', backref='user', lazy=True, cascade="all, delete-orphan")
    # Relação um-para-um com as metas do usuário.
    goals = db.relationship('UserGoals', backref='user', uselist=False, cascade="all, delete-orphan")

    # As relações abaixo existiam só como coluna de FK (sem relationship do lado
    # do User) — apagar um usuário deixava esses registros órfãos (ou, com
    # PRAGMA foreign_keys=ON já ligado, a própria exclusão falhava com um
    # IntegrityError de violação de FK, já que o SQLAlchemy não sabia que
    # precisava apagá-los junto). cascade="all, delete-orphan" garante que
    # apagar o User apaga tudo isso também.
    water_logs = db.relationship('WaterLog', backref='user', lazy=True, cascade="all, delete-orphan")
    weight_logs = db.relationship('WeightLog', backref='user', lazy=True, cascade="all, delete-orphan")
    favorite_meals = db.relationship('FavoriteMeal', backref='user', lazy=True, cascade="all, delete-orphan")
    # workouts já cascateia pra SetLog (workout.py define cascade="all, delete-orphan"
    # em "sets"), então isso cobre a cadeia inteira: User -> Workout -> SetLog.
    workouts = db.relationship('Workout', backref='user', lazy=True, cascade="all, delete-orphan")
    # weekly_plan já cascateia pra WeeklyPlanDay (weekly_plan.py define
    # cascade="all, delete-orphan" em "days"), cobrindo User -> WeeklyPlan -> WeeklyPlanDay.
    weekly_plan = db.relationship('WeeklyPlan', backref='user', uselist=False, cascade="all, delete-orphan")
    # Mesmo raciocínio das relações acima — os arquivos em disco (não só as
    # linhas) ficariam órfãos se um fluxo de exclusão de conta for adicionado
    # no futuro; a cascade aqui garante ao menos a integridade referencial.
    progress_photos = db.relationship('ProgressPhoto', backref='user', lazy=True, cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)