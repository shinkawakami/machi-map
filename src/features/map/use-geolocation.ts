"use client";

import { useCallback, useState } from "react";

import type { LatLng } from "@/lib/geo";

/**
 * 現在地を取る。
 *
 * HTTPS でないと（localhost を除いて）ブラウザが拒否するので、
 * 本番の https://wagaya-nigesaki.vercel.app/ が前提。
 *
 * **取れた場所は起点とは別に持ち続ける。** 起点を自宅に切り替えたあとでも
 * 「いま自分がどこにいるか」は地図に出していたいし、押せば戻せる。
 */
export type Geolocation = {
  /** 最後に取れた現在地。起点になっているとは限らない */
  here: LatLng | null;
  locating: boolean;
  error: string | null;
  /** 取りにいく。取れたら onFound に渡す（起点にするかは呼ぶ側が決める） */
  locate: () => void;
};

export function useGeolocation(onFound: (here: LatLng) => void): Geolocation {
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setError("このブラウザでは現在地を使えません");
      return;
    }

    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const found = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setLocating(false);
        setHere(found);
        onFound(found);
      },
      (failure) => {
        setLocating(false);
        setError(message(failure));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [onFound]);

  return { here, locating, error, locate };
}

function message(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "位置情報の利用が許可されていません";
    case error.POSITION_UNAVAILABLE:
      return "現在地を取得できませんでした";
    case error.TIMEOUT:
      return "現在地の取得に時間がかかっています。もう一度お試しください";
    default:
      return "現在地を取得できませんでした";
  }
}
