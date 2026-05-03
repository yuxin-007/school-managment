export type CampusCategory = 'teaching' | 'life' | 'sports' | 'dorm' | 'service' | 'gate' | 'scenery'

export interface MapPoint {
  x: number
  y: number
}

export interface CampusLocation {
  id: string
  name: string
  category: CampusCategory
  lngLat: [number, number]
  keywords: string[]
  summary: string
}

export const mapSize = {
  width: 1280,
  height: 1810,
}

export const studentStartPoint: MapPoint = { x: 640, y: 1592 }

export const campusLocations: CampusLocation[] = [
  {
    id: 'north-gate',
    name: '北门',
    category: 'gate',
    lngLat: [116.834556, 36.543568],
    keywords: ['北门', '校门', '入口', '报到'],
    summary: '长清湖校区主要入校点，适合作为新生报到和校内导航起点。',
  },
  {
    id: 'west-gate',
    name: '西门',
    category: 'gate',
    lngLat: [116.828573, 36.543246],
    keywords: ['西门', '校门', '公交', '入口'],
    summary: '校区西侧出入口，靠近候车点、二餐和生活区。',
  },
  {
    id: 'library',
    name: '图书馆',
    category: 'teaching',
    lngLat: [116.833425, 36.545275],
    keywords: ['图书馆', '自习', '借书', '学习'],
    summary: '校区中部核心学习空间，适合自习、借阅和查阅资料。',
  },
  {
    id: 'wenyuan-building',
    name: '文渊楼',
    category: 'teaching',
    lngLat: [116.8313, 36.5468],
    keywords: ['文渊楼', '教学楼', '上课', 'A区', 'B区', 'C区', 'D区', 'E区'],
    summary: '大型教学楼组，新生上课、找教室最常用的地点之一。',
  },
  {
    id: 'information-building',
    name: '信息技术楼',
    category: 'teaching',
    lngLat: [116.830678, 36.54693],
    keywords: ['信息技术楼', '信息楼', '实验', '机房'],
    summary: '信息类课程和实验教学常用楼宇，靠近文渊楼片区。',
  },
  {
    id: 'first-canteen',
    name: '一餐',
    category: 'life',
    lngLat: [116.836531, 36.545276],
    keywords: ['一餐', '餐厅', '食堂', '吃饭'],
    summary: '校区主要餐饮点之一，靠近宿舍区和图书馆西侧。',
  },
  {
    id: 'second-canteen',
    name: '二餐',
    category: 'life',
    lngLat: [116.834975, 36.551125],
    keywords: ['二餐', '餐厅', '食堂', '吃饭'],
    summary: '靠近西门和候车点的餐饮区，适合从西侧入校后就近用餐。',
  },
  {
    id: 'clinic',
    name: '校医院',
    category: 'service',
    lngLat: [116.835592, 36.542769],
    keywords: ['校医院', '医院', '医务室', '看病'],
    summary: '校内医疗服务点，适合处理日常问诊、开药和体检相关事项。',
  },
  {
    id: 'zhu-dorms',
    name: '竹苑宿舍区',
    category: 'dorm',
    lngLat: [116.8339, 36.5449],
    keywords: ['竹苑', '宿舍', '公寓'],
    summary: '校区北部宿舍片区，新生入住时可优先搜索具体楼栋。',
  },
  {
    id: 'lan-dorms',
    name: '兰苑宿舍区',
    category: 'dorm',
    lngLat: [116.835194, 36.543726],
    keywords: ['兰苑', '宿舍', '公寓'],
    summary: '靠近生活服务区和校医院的宿舍片区。',
  },
  {
    id: 'mei-dorms',
    name: '梅苑宿舍区',
    category: 'dorm',
    lngLat: [116.837133, 36.54676],
    keywords: ['梅苑', '宿舍', '公寓'],
    summary: '靠近运动场和生活区的宿舍片区。',
  },
  {
    id: 'track-field',
    name: '田径场',
    category: 'sports',
    lngLat: [116.839041, 36.548348],
    keywords: ['田径场', '操场', '跑步', '体育'],
    summary: '校区主要运动场地，适合体育课、跑步和大型活动集合。',
  },
  {
    id: 'gymnasium',
    name: '体育馆',
    category: 'sports',
    lngLat: [116.839267, 36.549559],
    keywords: ['体育馆', '运动', '球馆'],
    summary: '室内体育活动和课程常用场馆。',
  },
  {
    id: 'tianyi-square',
    name: '天颐广场',
    category: 'scenery',
    lngLat: [116.834179, 36.549343],
    keywords: ['天颐广场', '广场', '集合'],
    summary: '校区中轴附近的开放空间，适合班级集合和路线参照。',
  },
  {
    id: 'mingxin-lake',
    name: '明心湖',
    category: 'scenery',
    lngLat: [116.83495, 36.5472],
    keywords: ['明心湖', '湖', '景观'],
    summary: '校区景观地标，靠近中轴路线和教学生活区。',
  },
  {
    id: 'waiting-stop',
    name: '候车点',
    category: 'service',
    lngLat: [116.835463, 36.551481],
    keywords: ['候车点', '车站', '校车', '公交'],
    summary: '靠近二餐和西门的交通候车点。',
  },
]

export const categoryLabels: Record<CampusCategory, string> = {
  teaching: '教学',
  life: '生活',
  sports: '运动',
  dorm: '宿舍',
  service: '服务',
  gate: '校门',
  scenery: '地标',
}

export const categoryColors: Record<CampusCategory, string> = {
  teaching: '#246b8f',
  life: '#d06c2f',
  sports: '#2e8b57',
  dorm: '#b45a8d',
  service: '#5d6f7f',
  gate: '#193f6f',
  scenery: '#b1842d',
}
