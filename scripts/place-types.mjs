export const fields = {
  format: 'Формат визита', exhibition: 'Экспозиция', hours: 'Режим работы', tickets: 'Билеты',
  booking: 'Запись', duration: 'Продолжительность', accessibility: 'Доступность', age: 'Возраст',
  start: 'Начало маршрута', distance: 'Протяжённость', terrain: 'Характер пути', season: 'Сезон',
  permit: 'Разрешение', restrictions: 'Ограничения', equipment: 'Снаряжение',
  period: 'Датировка', interior: 'Вход внутрь', services: 'Богослужения', viewpoint: 'Откуда смотреть',
  program: 'Программа', audience: 'Для кого', location: 'Где искать', parking: 'Парковка',
  swimming: 'Статус купания', facilities: 'Что есть на месте', rooms: 'Размещение',
  checkin: 'Заезд и выезд', pets: 'С животными', food: 'Питание', price: 'Стоимость',
  arrival: 'Подъезд', contacts: 'Контакты',
};

const profile = (label, headings, priorities, checks, sourceLabel, schema = 'Place') => ({
  label, visit: headings[0], story: headings[1], highlights: headings[2],
  priorities: priorities.split(' '), checks, sourceLabel, schema,
});

const types = {
  museum: profile('Музей', ['Спланировать визит', 'История музея', 'Что увидеть в экспозиции'],
    'hours tickets booking duration accessibility exhibition', [
      ['hours', 'В какие дни открыта нужная вам экспозиция?'],
      ['tickets', 'Как купить билет и есть ли льготы?'],
      ['accessibility', 'Есть ли ступени у входа и в выставочных залах?'],
    ], 'Сайт музея', 'Museum'),
  schoolMuseum: profile('Школьный музей', ['Договориться о визите', 'История коллекции', 'Что увидеть в музее'],
    'booking hours exhibition audience accessibility', [
      ['booking', 'Принимает ли школа гостей и с кем согласовать время?'],
      ['location', 'Где вход для посетителей?'],
    ], 'Страница музея', 'Museum'),
  gallery: profile('Галерея', ['Спланировать визит', 'Коллекция и здание', 'Что увидеть в галерее'],
    'hours tickets exhibition booking accessibility', [
      ['exhibition', 'Какая выставка открыта на дату поездки?'],
      ['tickets', 'Где посмотреть цены и льготы?'],
    ], 'Сайт галереи', 'ArtGallery'),
  estateMuseum: profile('Музей-усадьба', ['Спланировать визит', 'История усадьбы', 'Что увидеть в усадьбе'],
    'hours tickets booking duration accessibility exhibition', [
      ['hours', 'Какие здания и части парка открыты в день визита?'],
      ['booking', 'Нужна ли запись на экскурсию или концерт?'],
      ['accessibility', 'Какие дорожки и здания доступны с коляской?'],
    ], 'Сайт музея-усадьбы', 'Museum'),
  nature: profile('Природное место', ['Спланировать прогулку', 'Ландшафт и история', 'На что обратить внимание'],
    'restrictions start terrain season duration equipment arrival', [
      ['start', 'Откуда начинается общедоступный подход?'],
      ['terrain', 'Как меняется проходимость тропы в этот сезон?'],
    ], 'Страница природного места'),
  reserve: profile('Охраняемая территория', ['Проверить доступ', 'Что охраняют', 'Что можно увидеть'],
    'permit restrictions season start hours booking', [
      ['permit', 'На какие участки можно попасть и нужно ли разрешение?'],
      ['season', 'Какие маршруты действуют на выбранную дату?'],
    ], 'Сайт охраняемой территории'),
  trail: profile('Маршрут на природе', ['Подготовиться к маршруту', 'Как проходит маршрут', 'Что встретится по пути'],
    'distance duration start terrain permit season restrictions equipment age booking', [
      ['start', 'Где точный старт и как вернуться после финиша?'],
      ['season', 'На какую дату открыт маршрут?'],
      ['equipment', 'Что взять с собой и что можно получить на месте?'],
    ], 'Страница маршрута'),
  church: profile('Храм или монастырь', ['Уточнить посещение', 'История и архитектура', 'Что заметить в храме'],
    'services interior hours period accessibility', [
      ['interior', 'В какие часы храм открыт для посетителей?'],
      ['services', 'Когда идут службы?'],
    ], 'Страница прихода', 'PlaceOfWorship'),
  architecture: profile('Историческое место', ['Найти место', 'История места', 'Какие детали рассмотреть'],
    'interior viewpoint period location restrictions', [
      ['viewpoint', 'Откуда виден фасад или памятная доска?'],
    ], 'Страница объекта'),
  memorial: profile('Памятное место', ['Найти памятное место', 'Кому и чему посвящено', 'Что увидеть на месте'],
    'viewpoint period location accessibility', [
      ['accessibility', 'Как пройти к памятнику от ближайшей улицы?'],
    ], 'Страница памятного места'),
  stage: profile('Театр', ['Выбрать спектакль', 'Сцена и её история', 'Что посмотреть в театре'],
    'program tickets age duration accessibility hours', [
      ['program', 'Что идёт в выбранный день?'],
      ['age', 'Какие возрастные рекомендации у постановки?'],
    ], 'Афиша театра', 'PerformingArtsTheater'),
  culture: profile('Культурная площадка', ['Выбрать событие', 'О площадке', 'Что здесь проходит'],
    'program hours booking age audience tickets accessibility', [
      ['program', 'Какие события открыты для гостей?'],
      ['booking', 'Нужен ли билет или предварительная запись?'],
    ], 'Афиша и контакты'),
  library: profile('Библиотека', ['Спланировать визит', 'История и фонды', 'Чем заняться в библиотеке'],
    'hours program booking exhibition accessibility', [
      ['booking', 'Как договориться о просмотре краеведческой коллекции?'],
      ['hours', 'Когда открыт нужный зал или отдел?'],
    ], 'Сайт библиотеки', 'Library'),
  workshop: profile('Мастерская или студия', ['Записаться на занятие', 'Как устроена площадка', 'Чему можно научиться'],
    'program age booking duration price equipment accessibility', [
      ['age', 'Для какого возраста рассчитано занятие?'],
      ['booking', 'Можно ли записаться на разовое занятие?'],
      ['equipment', 'Включены ли материалы в стоимость?'],
    ], 'Расписание и контакты'),
  art: profile('Городское искусство', ['Найти работу', 'История работы', 'Что заметить'],
    'location viewpoint period', [['viewpoint', 'Откуда удобно рассмотреть работу?']], 'Страница объекта'),
  park: profile('Прогулка и отдых', ['Спланировать прогулку', 'Как устроено место', 'Чем заняться'],
    'location facilities hours accessibility parking season', [
      ['facilities', 'Какие зоны и услуги работают в день визита?'],
      ['accessibility', 'Какое покрытие у дорожек, есть ли ступени?'],
    ], 'Страница площадки'),
  beach: profile('Пляж', ['Проверить условия на берегу', 'Как устроен берег', 'Берег и ориентиры'],
    'swimming season location facilities restrictions arrival', [
      ['swimming', 'Включён ли этот берег в официальный перечень на ваш сезон?'],
      ['location', 'Где находится открытый подход к берегу?'],
    ], 'Информация о пляже'),
  cinema: profile('Кинотеатр', ['Выбрать сеанс', 'О кинотеатре', 'Что учесть при выборе сеанса'],
    'program tickets age location accessibility', [
      ['program', 'Какие фильмы идут на выбранную дату?'],
      ['age', 'Какой возрастной рейтинг у фильма?'],
    ], 'Расписание сеансов', 'MovieTheater'),
  activity: profile('Спорт и активный отдых', ['Выбрать занятие', 'О площадке', 'Чем заняться'],
    'program booking age price equipment hours accessibility', [
      ['age', 'Есть ли требования к возрасту или подготовке?'],
      ['equipment', 'Есть ли прокат и что нужно взять с собой?'],
    ], 'Расписание и запись'),
  leisure: profile('Отдых и услуги', ['Спланировать визит', 'О площадке', 'Чем заняться'],
    'booking price program facilities hours age parking', [
      ['booking', 'Можно ли приехать без записи?'],
      ['price', 'Что входит в стоимость?'],
    ], 'Условия и контакты'),
  stay: profile('Ночлег', ['Где и как остановиться', 'О размещении', 'Номера и удобства'],
    'rooms checkin booking price facilities food pets parking accessibility arrival permit restrictions', [
      ['booking', 'Есть ли свободные места на ваши даты и как их забронировать?'],
      ['price', 'Какая итоговая стоимость и условия отмены?'],
      ['pets', 'Каковы правила размещения с животными?'],
    ], 'Контакты для бронирования', 'LodgingBusiness'),
  campsite: profile('Кемпинг', ['Спланировать ночёвку', 'О кемпинге', 'Палатки и удобства'],
    'permit booking season facilities equipment food arrival price restrictions', [
      ['arrival', 'Куда подъехать и разрешён ли въезд на своём транспорте?'],
      ['equipment', 'Есть ли питьевая вода, розетки и прокат снаряжения?'],
    ], 'Условия кемпинга', 'Campground'),
};

export function placeType(place) {
  const { category, name, id, lodgingType } = place;
  switch (category) {
    case 'museums':
      if (/школьн|школы/iu.test(name)) return types.schoolMuseum;
      if (/усадьба|ивановка/iu.test(name)) return types.estateMuseum;
      if (/галерея|выставочный зал/iu.test(name)) return types.gallery;
      return types.museum;
    case 'nature':
      if (/экотропа|маршрут|автоэкскурсия/iu.test(name)) return types.trail;
      if (/заповедник|заказник|памятник природы/iu.test(name) || place.access === 'restricted') return types.reserve;
      return types.nature;
    case 'history':
      if (/храм|церковь|собор|монастырь|часовня/iu.test(name) && id !== 'bsk-station') return types.church;
      if (/мемориал|памятник|скульптура|могила|место памяти|парк победы/iu.test(name)) return types.memorial;
      return types.architecture;
    case 'culture':
      if (/театр/iu.test(name) && id !== 'vg-yubileinyi-stage') return types.stage;
      if (/библиотек/iu.test(name)) return types.library;
      if (/галерея/iu.test(name)) return types.gallery;
      if (/ремёсел|семейная арт-поляна/iu.test(name)) return types.workshop;
      if (/портрет|скульптурн/iu.test(name)) return types.art;
      return types.culture;
    case 'leisure':
      if (/пляж/iu.test(name)) return types.beach;
      if (/кинотеатр/iu.test(name)) return types.cinema;
      if (/конноспортивн|ипподром|спорт|ледовый|ролик|самокат/iu.test(name)) return types.activity;
      if (/спа|база отдыха|крутопарк/iu.test(name)) return types.leisure;
      return types.park;
    case 'stay':
      return lodgingType === 'camping' ? types.campsite : {
        ...types.stay,
        label: { hotel: /^Мотель/u.test(name) ? 'Мотель' : 'Гостиница', guesthouse: 'Гостевой дом', base: 'База отдыха' }[lodgingType] || types.stay.label,
        schema: lodgingType === 'hotel' ? (/^Мотель/u.test(name) ? 'Motel' : 'Hotel') : types.stay.schema,
      };
    default:
      throw new Error(`Unknown category ${category} for ${id}`);
  }
}
