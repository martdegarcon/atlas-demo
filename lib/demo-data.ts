import type { Trip } from "./types"

// Стартовый набор: им база заполняется при самом первом запуске, и к нему же
// можно вернуться из «Ещё → Данные»
const U = (id: string) => `https://images.unsplash.com/${id}?w=1200&q=72&auto=format&fit=crop`

export const demoTrips: Trip[] = [
  {
    id: "japan-2025", slug: "japan-2025", title: "Япония", country: "Япония", year: 2025, period: "12–28 окт", isPublic: true,
    createdAt: "2025-10-28T00:00:00.000Z",
    cities: [
      { id: "tokyo", name: "Токио", lng: 139.6917, lat: 35.6895, date: "12 окт", entries: [
        { id: "tokyo-1", time: "12 окт, 09:40", text: "Приземлились в Ханэду. Suica лучше взять сразу в аэропорту.", photo: U("photo-1436491865332-7a61a109cc05") },
        { id: "tokyo-2", time: "13 окт, 13:15", text: "Рамен в Синдзюку, потом пешком до парка.", photo: U("photo-1557872943-16a5ac26437e") },
        { id: "tokyo-3", time: "14 окт, 17:40", text: "Шибуя на закате. Перекрёсток лучше смотреть сверху.", photo: U("photo-1540959733332-eab4deabeeaf") },
      ] },
      { id: "nikko", name: "Никко", lng: 139.6203, lat: 36.7199, date: "15 окт", entries: [{ id: "nikko-1", text: "Храмы в осеннем лесу. Ехать с ночёвкой, днём слишком людно.", photo: U("photo-1769868944122-1bffed5547c6") }] },
      { id: "hakone", name: "Хаконе", lng: 139.0266, lat: 35.2324, date: "18 окт", entries: [{ id: "hakone-1", text: "Онсэн с видом на Фудзи. Погода менялась каждый час.", photo: U("photo-1749352133990-67bf2a652149") }] },
      { id: "kyoto", name: "Киото", lng: 135.7681, lat: 35.0116, date: "21 окт", entries: [{ id: "kyoto-1", text: "Фусими Инари рано утром, пока нет толпы. Взять велосипед.", photo: U("photo-1478436127897-769e1b3f0f36") }] },
      { id: "nara", name: "Нара", lng: 135.8048, lat: 34.6851, date: "25 окт", entries: [{ id: "nara-1", text: "Олени в парке. Хватило полдня.", photo: U("photo-1732629558278-f527fc461a3b") }] },
      { id: "osaka", name: "Осака", lng: 135.5023, lat: 34.6937, date: "27 окт", entries: [{ id: "osaka-1", text: "Дотомбори вечером, такояки на каждом углу.", photo: U("photo-1759746334715-fae30ec56600") }] },
    ],
  },
  {
    id: "portugal-2024", slug: "portugal-2024", title: "Португалия", country: "Португалия", year: 2024, period: "3–11 июн", isPublic: true,
    createdAt: "2024-06-11T00:00:00.000Z",
    cities: [
      { id: "lisbon", name: "Лиссабон", lng: -9.1393, lat: 38.7223, date: "3 июн", entries: [{ id: "lisbon-1", text: "Трамвай 28 и паштел-де-ната. Холмы тяжёлые, обувь удобную.", photo: U("photo-1753236431862-cd7cbf87d1f4") }] },
      { id: "sintra", name: "Синтра", lng: -9.3817, lat: 38.8029, date: "6 июн" },
      { id: "porto", name: "Порту", lng: -8.611, lat: 41.1579, date: "9 июн" },
    ],
  },
  {
    id: "turkey-2023", slug: "turkey-2023", title: "Турция", country: "Турция", year: 2023, period: "5–9 сен", isPublic: true,
    createdAt: "2023-09-09T00:00:00.000Z",
    cities: [
      { id: "istanbul", name: "Стамбул", lng: 28.9784, lat: 41.0082, date: "5 сен", entries: [{ id: "istanbul-1", text: "Паром через Босфор лучше любой экскурсии.", photo: U("photo-1589561454226-796a8aa89b05") }] },
      { id: "goreme", name: "Гёреме", lng: 34.829, lat: 38.6431, date: "8 сен" },
    ],
  },
]
