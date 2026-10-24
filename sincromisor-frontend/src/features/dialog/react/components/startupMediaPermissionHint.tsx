import { useEffect, useState } from "react";

type PermissionDevice = "microphone" | "camera";

/** 権限を要求せず、既に拒否された機器だけブラウザー側の再設定先を示す。 */
export function StartupMediaPermissionHint({ device }: { device: PermissionDevice }) {
    const [denied, setDenied] = useState(false);
    useEffect(() => {
        let disposed = false;
        let permission: PermissionStatus | undefined;
        const update = () => setDenied(permission?.state === "denied");
        void navigator.permissions
            ?.query({ name: device })
            .then((status) => {
                if (disposed) return;
                permission = status;
                update();
                status.addEventListener("change", update);
            })
            .catch(() => {
                // 権限照会に非対応のブラウザーでは、開始時の取得結果による案内へ委ねる。
            });
        return () => {
            disposed = true;
            permission?.removeEventListener("change", update);
        };
    }, [device]);
    if (!denied) return null;
    return (
        <p className="settingsPrimitiveFieldDescription">
            {device === "camera" ? "カメラ" : "マイク"}の権限が拒否されています。
            使う場合はブラウザーのサイト設定で許可してください。
            {device === "camera" ? "カメラをオフにして続けることもできます。" : ""}
        </p>
    );
}
