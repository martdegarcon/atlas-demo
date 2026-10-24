// Локализация интерфейса ru/en. Переводится только «оболочка» — названия
// поездок, городов и заметки остаются как есть, это контент.
export type Lang = "ru" | "en"

export const languages: { id: Lang; label: string }[] = [
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
]

const ru = {
  navMap: "Карта", navTrips: "Поездки", navNotes: "Заметки", navMore: "Ещё",
  searchPlaceholder: "Найти город или поездку",
  addPlaceAria: "Добавить место",
  panelCollapseAria: "Свернуть панель", panelExpandAria: "Развернуть панель",
  panelAria: "Мой атлас", navAria: "Основная навигация", backAria: "Назад",
  next: "Дальше", noEntriesForCity: "Заметок про этот город пока нет.",
  atlasTitle: "Атлас", tripEyebrow: "Поездка",
  tripsHeader: "Поездки", tripsEmpty: "Поездок пока нет.",
  notesHeader: "Заметки", notesEmpty: "Заметок пока нет.",
  moreHeader: "Ещё", statTripsLabel: "поездки", statCountriesLabel: "страны", statCitiesLabel: "города",
  cancel: "Отмена",
  settingsHeader: "Настройки", themeLabel: "Тема", themeLight: "Светлая", themeDark: "Тёмная", themeSystem: "Системная",
  languageLabel: "Язык",
  addPlaceTitle: "Новое место", addPlaceBackAria: "Назад к поиску", closeAria: "Закрыть",
  kindCity: "Город", kindCountry: "Страна",
  kindCityHint: "Город попадёт в поездку — существующую или новую.",
  kindCountryHint: "Страна без городов — просто отметка на карте: была, без деталей по городам.",
  searchModeName: "По названию", searchModeLink: "По ссылке",
  cityPlaceholder: "Название города", countryPlaceholder: "Название страны",
  linkPlaceholder: "Ссылка на Google Maps",
  linkHint: "Вставьте ссылку на место из Google Maps — распознаем название и координаты.",
  linkSubmit: "Найти по ссылке", linkResolving: "Распознаю ссылку…",
  linkNotFound: "Не удалось распознать место по этой ссылке.",
  searching: "Ищу…", noResults: "Ничего не нашлось",
  tripLabel: "Поездка", newTripOption: "+ Новая поездка",
  tripTitlePlaceholder: "Название поездки", yearPlaceholder: "Год", datePlaceholder: "Дата, например «12 окт»",
  notePlaceholder: "Заметка (необязательно)", addCityButton: "Добавить город", addCountryButton: "Добавить страну",
  quickSearchHint: "Начните вводить — найдём город или поездку.",
  edit: "Редактировать", editCity: "Изменить город", editTrip: "Изменить поездку",
  newEntry: "Новая заметка", editEntry: "Изменить заметку", addEntry: "Добавить заметку",
  save: "Сохранить", saved: "Сохранено", deleted: "Удалено", undo: "Отменить",
  deleteCity: "Удалить город", deleteTrip: "Удалить поездку", deleteEntry: "Удалить заметку",
  cityNameLabel: "Название", dateLabel: "Дата", titleLabel: "Название", yearLabel: "Год",
  periodLabel: "Даты поездки", periodPlaceholder: "Например «12–28 окт»", countryLabel: "Страна",
  timeLabel: "Когда", timePlaceholder: "Например «12 окт, 09:40»", textLabel: "Текст",
  entryTextPlaceholder: "Что хочется запомнить?",
  addPhoto: "Добавить фото", replacePhoto: "Заменить", removePhoto: "Убрать",
  photoLoading: "Загружаю фото…", photoError: "Не получилось загрузить фото. Попробуйте JPG или PNG.",
  citiesOrder: "Порядок городов", moveUp: "Выше", moveDown: "Ниже",
  visibilityLabel: "Кто видит", visPublic: "Все", visPrivate: "Только я", privateBadge: "скрыта",
  dataHeader: "Данные", exportAction: "Скачать бэкап", exportHint: "JSON-файл со всеми поездками и заметками",
  importAction: "Восстановить из бэкапа", importHint: "Заменит текущие данные — можно будет отменить",
  importDone: "Данные восстановлены", importError: "Этот файл не похож на бэкап Атласа",
  emptyAtlas: "Атлас пока пуст. Нажмите «+», чтобы отметить первое место.",
  emptyAtlasPublic: "Здесь пока ничего нет.",
  saveError: "Не удалось сохранить — проверьте соединение. Изменение отменено.",
  sessionExpired: "Сессия истекла — войдите снова",
  ownerLogin: "Вход для владельца", ownerHint: "Это публичная версия атласа — только для просмотра.",
  ownerSignedIn: "Вы вошли как владелец", logout: "Выйти",
  loginTitle: "Вход", passwordLabel: "Пароль", loginAction: "Войти",
  loginWrong: "Неверный пароль", loginBlocked: "Слишком много попыток — подождите 15 минут",
  loginNotConfigured: "Вход не настроен: на сервере не задан ADMIN_PASSWORD",
  shareAria: "Поделиться", shareTrip: "Поделиться поездкой", shareCity: "Поделиться местом",
  shareLinkTitle: "Ссылка", shareLinkHint: "Откроет атлас сразу на этом месте; в Telegram появится превью.",
  copyLink: "Скопировать", send: "Отправить", download: "Скачать", linkCopied: "Ссылка скопирована",
  privateNote: "Сейчас поездку видите только вы — по ссылке она не откроется.",
  makePublic: "Открыть доступ всем",
  videoTitle: "Видео-пролёт", videoHint: "Камера летит по городам, маршрут прорисовывается. В Telegram играет как гифка.",
  videoMake: "Собрать видео", videoPrepare: "Готовлю карту…", videoRendering: "Собираю видео",
  videoKeepTab: "Не сворачивайте вкладку, пока идёт сборка",
  videoUnsupported: "Этот браузер не умеет собирать видео. Откройте атлас в Chrome, Edge или Safari 17+.",
  videoFailed: "Не получилось собрать видео", videoRedo: "Собрать заново",
  cardTitle: "Карточка", cardHint: "Постер 1080×1350: маршрут, города, даты.",
  shareFailed: "Не получилось поделиться",
  yearRequired: "Укажите год",
  yearFormat: "Год — четыре цифры",
  yearRange: "Год от {min} до {max}",
  nameRequired: "Введите название",
  countryRequired: "Введите страну",
  entryNeedsContent: "Добавьте текст или фото",
  searchMinChars: "Введите хотя бы 2 буквы",
  needTripTitle: "Назовите новую поездку",
  postViewerAria: "Заметка",
  openPost: "Открыть заметку",
  openPhoto: "Открыть фото",
  openOnMap: "Показать на карте",
  prevAria: "Предыдущая",
  nextAria: "Следующая",
  loginSetupHint: "Чтобы включить вход, задайте на сервере переменную ADMIN_PASSWORD (локально — в файле .env.local) и перезапустите приложение.",
}

export type DictKey = keyof typeof ru

const en: Record<DictKey, string> = {
  navMap: "Map", navTrips: "Trips", navNotes: "Notes", navMore: "More",
  searchPlaceholder: "Find a city or trip",
  addPlaceAria: "Add a place",
  panelCollapseAria: "Collapse panel", panelExpandAria: "Expand panel",
  panelAria: "My atlas", navAria: "Main navigation", backAria: "Back",
  next: "Next", noEntriesForCity: "No notes for this city yet.",
  atlasTitle: "Atlas", tripEyebrow: "Trip",
  tripsHeader: "Trips", tripsEmpty: "No trips yet.",
  notesHeader: "Notes", notesEmpty: "No notes yet.",
  moreHeader: "More", statTripsLabel: "trips", statCountriesLabel: "countries", statCitiesLabel: "cities",
  cancel: "Cancel",
  settingsHeader: "Settings", themeLabel: "Theme", themeLight: "Light", themeDark: "Dark", themeSystem: "System",
  languageLabel: "Language",
  addPlaceTitle: "New place", addPlaceBackAria: "Back to search", closeAria: "Close",
  kindCity: "City", kindCountry: "Country",
  kindCityHint: "A city goes into a trip — an existing one or a new one.",
  kindCountryHint: "A country with no cities is just a marker on the map: been there, no city detail.",
  searchModeName: "By name", searchModeLink: "By link",
  cityPlaceholder: "City name", countryPlaceholder: "Country name",
  linkPlaceholder: "Google Maps link",
  linkHint: "Paste a Google Maps link to a place — we'll pick up its name and coordinates.",
  linkSubmit: "Look up link", linkResolving: "Resolving link…",
  linkNotFound: "Couldn't recognize a place from that link.",
  searching: "Searching…", noResults: "Nothing found",
  tripLabel: "Trip", newTripOption: "+ New trip",
  tripTitlePlaceholder: "Trip name", yearPlaceholder: "Year", datePlaceholder: "Date, e.g. “Oct 12”",
  notePlaceholder: "Note (optional)", addCityButton: "Add city", addCountryButton: "Add country",
  quickSearchHint: "Start typing to find a city or trip.",
  edit: "Edit", editCity: "Edit city", editTrip: "Edit trip",
  newEntry: "New note", editEntry: "Edit note", addEntry: "Add a note",
  save: "Save", saved: "Saved", deleted: "Deleted", undo: "Undo",
  deleteCity: "Delete city", deleteTrip: "Delete trip", deleteEntry: "Delete note",
  cityNameLabel: "Name", dateLabel: "Date", titleLabel: "Title", yearLabel: "Year",
  periodLabel: "Trip dates", periodPlaceholder: "E.g. “Oct 12–28”", countryLabel: "Country",
  timeLabel: "When", timePlaceholder: "E.g. “Oct 12, 09:40”", textLabel: "Text",
  entryTextPlaceholder: "What do you want to remember?",
  addPhoto: "Add a photo", replacePhoto: "Replace", removePhoto: "Remove",
  photoLoading: "Uploading photo…", photoError: "Couldn't upload that photo. Try a JPG or PNG.",
  citiesOrder: "City order", moveUp: "Move up", moveDown: "Move down",
  visibilityLabel: "Who can see it", visPublic: "Everyone", visPrivate: "Only me", privateBadge: "hidden",
  dataHeader: "Data", exportAction: "Download backup", exportHint: "A JSON file with every trip and note",
  importAction: "Restore from backup", importHint: "Replaces your current data — you can undo it",
  importDone: "Data restored", importError: "That file doesn't look like an Atlas backup",
  emptyAtlas: "Your atlas is empty. Tap “+” to mark your first place.",
  emptyAtlasPublic: "Nothing here yet.",
  saveError: "Couldn't save — check your connection. The change was undone.",
  sessionExpired: "Your session expired — please sign in again",
  ownerLogin: "Owner sign-in", ownerHint: "This is the public version of the atlas — view only.",
  ownerSignedIn: "Signed in as the owner", logout: "Sign out",
  loginTitle: "Sign in", passwordLabel: "Password", loginAction: "Sign in",
  loginWrong: "Wrong password", loginBlocked: "Too many attempts — wait 15 minutes",
  loginNotConfigured: "Sign-in isn't set up: ADMIN_PASSWORD is missing on the server",
  shareAria: "Share", shareTrip: "Share trip", shareCity: "Share place",
  shareLinkTitle: "Link", shareLinkHint: "Opens the atlas right on this place; Telegram shows a preview.",
  copyLink: "Copy", send: "Send", download: "Download", linkCopied: "Link copied",
  privateNote: "Only you can see this trip right now — the link won't open for others.",
  makePublic: "Make it public",
  videoTitle: "Fly-through video", videoHint: "The camera flies city to city as the route draws in. Plays like a GIF in Telegram.",
  videoMake: "Make the video", videoPrepare: "Preparing the map…", videoRendering: "Rendering video",
  videoKeepTab: "Keep this tab open while it renders",
  videoUnsupported: "This browser can't render video. Open the atlas in Chrome, Edge or Safari 17+.",
  videoFailed: "Couldn't render the video", videoRedo: "Render again",
  cardTitle: "Card", cardHint: "A 1080×1350 poster: route, cities, dates.",
  shareFailed: "Couldn't share",
  yearRequired: "Enter a year",
  yearFormat: "Year must be four digits",
  yearRange: "Year from {min} to {max}",
  nameRequired: "Enter a name",
  countryRequired: "Enter a country",
  entryNeedsContent: "Add text or a photo",
  searchMinChars: "Type at least 2 letters",
  needTripTitle: "Name the new trip",
  postViewerAria: "Note",
  openPost: "Open note",
  openPhoto: "Open photo",
  openOnMap: "Show on map",
  prevAria: "Previous",
  nextAria: "Next",
  loginSetupHint: "To enable sign-in, set ADMIN_PASSWORD on the server (locally — in .env.local) and restart the app.",
}

export const dict: Record<Lang, Record<DictKey, string>> = { ru, en }

export function t(lang: Lang, key: DictKey): string {
  return dict[lang][key]
}

const FORMS = {
  trip: { ru: ["поездка", "поездки", "поездок"], en: ["trip", "trips"] },
  country: { ru: ["страна", "страны", "стран"], en: ["country", "countries"] },
  city: { ru: ["город", "города", "городов"], en: ["city", "cities"] },
} as const

function pluralRu(n: number, forms: readonly string[]) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return forms[0]
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1]
  return forms[2]
}

export function countLabel(lang: Lang, n: number, key: keyof typeof FORMS): string {
  const f = FORMS[key]
  return lang === "en" ? `${n} ${n === 1 ? f.en[0] : f.en[1]}` : `${n} ${pluralRu(n, f.ru)}`
}

// «Без городов» — только у страны-отметки или пустой поездки
export function citiesTag(lang: Lang, trip: { kind?: string; cities: unknown[] }): string {
  const n = trip.cities.length
  if (trip.kind === "country" || n === 0) return lang === "ru" ? "без городов" : "no cities"
  return countLabel(lang, n, "city")
}

export const STORAGE_LANG_KEY = "atlas-lang"
