"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTimedOffer } from "@/client/use-timed-offer";
import type { PanelView } from "@/features/panel/ShelterPanel";
import type { LatLng } from "@/lib/geo";
import { type Origin, sameOrigin } from "@/lib/origin";
import type { Place } from "@/lib/places";

/**
 * 「いまどこの話をしているか」。起点・見ている面・選択中の点をまとめて持つ。
 *
 * **3つは必ず一緒に動く。** 起点が移れば見る面も変わり、取り消せば両方とも戻る。
 * 別々の state に置くと、どこか1か所だけ更新し忘れた組み合わせができる。
 * 更新の口をこのフックに集めて、組み合わせが崩れないようにする。
 */

/** 起点を戻せるあいだ（ms）。 */
const UNDO_MS = 12_000;

export type PickOptions = {
  /** 切り替える面。省略すると、いま見ている面のまま（ピンをドラッグしたとき） */
  view?: "summary" | "list";
  /**
   * 押すつもりが無くても起きる操作か。**地図のタップだけ true。**
   * 住所・現在地・★は自分で選んだ操作なので、戻す口は要らない。
   */
  undoable?: boolean;
};

export type OriginState = {
  /** 実際の起点。自分で決めたものが優先で、無ければ拠点の1つ目 */
  origin: Origin | null;
  /** まだ自分では何も決めていない（＝起点は拠点の1つ目） */
  auto: boolean;
  view: PanelView;
  /** 地図で輪を出している避難場所 */
  selected: LatLng | null;
  /**
   * 戻せる起点。**移した先から起点がさらに動いていたら、もう出さない。**
   * 住所や現在地で決め直したあとに「元に戻す」が残っていると、
   * 自分で選んだ操作のほうが取り消される。
   */
  undoable: Origin | null;

  pick: (next: Origin, options?: PickOptions) => void;
  /** 見る面を切り替える（起点は動かさない） */
  show: (state: "summary" | "list") => void;
  /**
   * 詳細を開いて、その点に選択の輪を出す。地図の点を押したときと、
   * 詳細の中の「同じ住所にある指定」を押したときに呼ぶ。
   *
   * `from` は詳細から戻る先。地図から開いたときは一覧に返すのが自然だが、
   * **災害別の表から開いた行の中で押されたときは、表に返さないと行き先が変わる。**
   */
  openDetail: (id: string, at: LatLng, from?: "summary" | "list") => void;
  /** 選択の輪だけ動かす（一覧で行を選んだとき・null で消す） */
  select: (target: LatLng | null) => void;
  /** 押し間違いで移った起点を、見ていた面ごと戻す。戻り先を返す（カメラ用） */
  undo: () => Origin | null;
};

export function useOrigin(places: Place[]): OriginState {
  /**
   * 自分で決めた起点。現在地ボタン・住所・地図のタップ・★のどれで決めても、
   * 起点は常に1つなので1つの state にまとめる（どちらが勝つかを決めずに済む）。
   */
  const [picked, setPicked] = useState<Origin | null>(null);
  const [view, setView] = useState<PanelView>({ state: "summary" });
  const [selected, setSelected] = useState<LatLng | null>(null);

  /*
    「移る前に見ていた面」は、pick を呼ぶ時点の view。地図のイベントハンドラから
    読むので、描画のたびに更新する控えを持つ（state を直接読むと、
    ハンドラが閉じ込めた古い値になる）。
  */
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /**
   * 地図を押して起点が移ったときの、戻り先。
   *
   * **地図を押す操作だけ、押すつもりが無くても起きる。** 地図のタップはパンの
   * 終わりと見分けがつかず、当たると表が丸ごと入れ替わる。しかも移る前の起点が
   * 拠点でなければ（住所で指した地点など）、★から戻ることもできない。
   *
   * 移った先（to）も一緒に持つ。起点がさらに動いたら、この申し出は古くなって
   * 黙って消える——押す口をひとつずつ閉じて回らなくて済む。
   */
  const [undoOffer, offerUndo] = useTimedOffer<{
    from: Origin;
    /** 移る前に見ていた面。戻すなら見ていたところまで戻す */
    fromView: PanelView;
    to: Origin;
  }>(UNDO_MS);

  /**
   * 2回目以降は、開いた時点で拠点が起点になる。
   *
   * 拠点を持っている人が、全国の地図から始めて自分で寄り直す理由は無い。
   * URL で届いた拠点でも同じで、送られた人はその場所を見たくて開いている。
   * 拠点を1つも持っていないときだけ全国から始める（どこを出すべきか分からないので、
   * 適当な都市を出すと「なぜここ？」になる）。
   */
  const firstPlace = places[0];
  const autoOrigin: Origin | null = useMemo(
    () =>
      firstPlace
        ? {
            lat: firstPlace.lat,
            lng: firstPlace.lng,
            source: "saved",
            name: firstPlace.name,
          }
        : null,
    [firstPlace],
  );

  const origin = picked ?? autoOrigin;

  /*
    移る前の起点。pick は地図のイベントハンドラからも呼ばれるので、
    view と同じく控えから読む（閉じ込めた古い値を戻り先にしない）。
  */
  const originRef = useRef(origin);
  useEffect(() => {
    originRef.current = origin;
  }, [origin]);

  const pick = useCallback(
    (next: Origin, { view: nextView, undoable }: PickOptions = {}) => {
      // 戻り先があるときだけ申し出る。まだ起点が無いなら、戻す先も無い。
      if (undoable && originRef.current) {
        offerUndo({ from: originRef.current, fromView: viewRef.current, to: next });
      }
      setPicked(next);
      if (nextView) setView({ state: nextView });
    },
    [offerUndo],
  );

  const show = useCallback((state: "summary" | "list") => {
    setView({ state });
  }, []);

  const openDetail = useCallback(
    (id: string, at: LatLng, from: "summary" | "list" = "list") => {
      setSelected(at);
      setView({ state: "detail", id, from });
    },
    [],
  );

  const undo = useCallback(() => {
    if (!undoOffer) return null;
    setPicked(undoOffer.from);
    setView(undoOffer.fromView);
    setSelected(null);
    offerUndo(null);
    return undoOffer.from;
  }, [undoOffer, offerUndo]);

  return {
    origin,
    auto: picked === null,
    view,
    selected,
    undoable:
      undoOffer && sameOrigin(origin, undoOffer.to) ? undoOffer.from : null,
    pick,
    show,
    openDetail,
    select: setSelected,
    undo,
  };
}
