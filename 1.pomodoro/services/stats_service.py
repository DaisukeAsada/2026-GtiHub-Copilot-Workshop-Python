from datetime import datetime


class StatsService:
    def __init__(self, repository):
        self.repository = repository

    def get_today_stats(self, now=None):
        now = now or datetime.now()
        return self.repository.get_stats_for_date(now.date())
