from datetime import datetime
import pytz

beijing_tz = pytz.timezone('Asia/Shanghai')


def get_beijing_time():
    return datetime.now(beijing_tz).replace(tzinfo=None)