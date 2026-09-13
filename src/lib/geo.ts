/**
 * 座標まわりの計算。**DB もブラウザ API も触らないので、どこからでも読める。**
 *
 * 地図のリクエストを「繰り返す URL」に落とすための丸めが主役。CDN は URL を
 * キーにキャッシュするので、ビューポートの bbox をそのまま載せると
 * **1px パンしただけで別の URL** になり、キャッシュはまず当たらない
 * （`docs/01-app/03-api-reference/01-directives/use-cache-remote.md`
 * 「cache keys have mostly unique values per request → cache utilization will be near-zero」）。
 * 送る前に格子へ吸着させて、取りうる URL の数を絞る。
 *
 * 吸着はリクエストを組み立てる側、つまりブラウザでやらないと URL が揃わない。
 * DB を引く側（src/server）に置くとクライアントから読めないので、
 * 格子まわりの計算だけこちらに分けてある。
 */

export type LatLng = { lat: number; lng: number };

export type Bbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

/** 緯度1度あたりの距離（m）。経度は緯度によって縮むので後で補正する。 */
const DEG_LAT_M = 111_320;

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * `360 / 2^k` のはしごから、target にいちばん近いものを選ぶ。
 *
 * 2の冪に丸めるのは、格子の境界を地球に固定するため。bbox の幅からそのまま
 * 割ると、パンのたびに幅の丸め誤差で境界が動く。固定しておけば、同じズームで
 * ある限りパンしても格子の位置が変わらない（＝同じ URL になる）。
 */
function ladderStep(target: number): number {
  const k = Math.round(Math.log2(360 / target));
  return 360 / 2 ** clamp(k, 0, 20);
}

/**
 * クラスタのセルの大きさ。横方向を cells 個に割った幅を、はしごに丸めて返す。
 *
 * 緯度側も同じ度数を使う。メルカトルなので画面上は縦長のセルになるが
 * （日本の緯度で約1.24倍）、クラスタの点は構成要素の平均位置に置くので実害がない。
 */
export function cellSizeDeg(bbox: Bbox, cells: number): number {
  return ladderStep((bbox.east - bbox.west) / cells);
}

/**
 * 吸着の格子の細かさ。ビューポートの幅の 1/8 前後にする。
 *
 * 粗いほど URL は揃うが、そのぶん画面の外まで取りにいく。1/8 なら広がりは
 * 片側あたり最大でも幅の 12.5%（はしごの丸めを含めて約 18%）で、
 * 面積にして1.3倍ほど。この程度なら、余分に取った点は画面の外に描かれるだけで、
 * 転送量も MAX_POINTS の判定も大きくは動かない。
 */
const SNAP_CELLS = 8;

/**
 * ビューポートを格子に**外側へ**吸着させる。
 *
 * 内側に丸める（近いほうへ寄せる）と画面の縁が削れて、そこにある避難場所が
 * 消える。外側なら余るだけで足りなくならない。ついでに、次のパンの先読みにもなる。
 */
export function snapBbox(bbox: Bbox): Bbox {
  const step = ladderStep((bbox.east - bbox.west) / SNAP_CELLS);

  return {
    west: clamp(Math.floor(bbox.west / step) * step, -180, 180),
    east: clamp(Math.ceil(bbox.east / step) * step, -180, 180),
    south: clamp(Math.floor(bbox.south / step) * step, -90, 90),
    north: clamp(Math.ceil(bbox.north / step) * step, -90, 90),
  };
}

/**
 * クラスタの解像度の指定（cells）も2の冪に寄せる。
 *
 * これはクライアントの画面幅から出る数字なので、そのまま載せると
 * **画面幅の種類だけ URL が分かれる**（4〜32 の29通り）。4通りに畳む。
 * cellSizeDeg 自体がはしごに丸めるので、出てくるセルの大きさはほとんど変わらない。
 */
export function snapCells(cells: number): number {
  if (!Number.isFinite(cells)) return 16;
  const k = Math.round(Math.log2(clamp(cells, 4, 32)));
  return 2 ** clamp(k, 2, 5);
}

/**
 * 座標を小数4桁（≒11m）に丸める。
 *
 * **丸める理由は2つあって、どちらもこの1つの関数で足りる。**
 *
 * 1. 起点から引く API のキャッシュ。拠点は固定点なので再訪・印刷・QR 共有で
 *    同じ URL が何度も来るが、現在地から引くときは毎回わずかに違う座標になる。
 *    11m 寄せれば同じ URL に落ちるし、その差が最寄りの順位を変えることはない
 *    （元データの座標には小数2桁の行もある）
 * 2. 拠点として URL に載せるとき。URL が短くなり、自宅の位置をそのままの精度で
 *    配らずに済む（src/lib/places.ts）
 */
export function roundCoord(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * 円を囲む矩形。索引（lat, lng）が効くのはこの部分だけ。
 *
 * 近い順の検索が「矩形で絞ってから円で切り直す」形をとるための、矩形のほう
 * （src/server/nearby.ts）。純粋な計算なのでここに置く。
 */
export function bboxAround(center: LatLng, radiusM: number): Bbox {
  const dLat = radiusM / DEG_LAT_M;

  // 経度方向の補正は、中心ではなく矩形の**端**の緯度で取る。中心の緯度で割ると
  // 極側の角が矩形からわずかにはみ出し、そこにある近い避難場所を取りこぼす。
  const edgeLat = Math.min(Math.abs(center.lat) + dLat, 89);
  const dLng = radiusM / (DEG_LAT_M * Math.cos((edgeLat * Math.PI) / 180));

  return {
    south: center.lat - dLat,
    north: center.lat + dLat,
    west: center.lng - dLng,
    east: center.lng + dLng,
  };
}
