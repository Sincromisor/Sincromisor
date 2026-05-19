import type { ReactNode } from "react";
import { SettingsSectionCard } from "../../../../features/settings/react/primitives/settingsPrimitives";

type SettingsCategorySectionProps = {
    title?: string;
    description?: string;
    children: ReactNode;
    defaultOpen?: boolean;
};

export function SettingsCategorySection({
    title,
    description,
    children,
    defaultOpen = true,
}: SettingsCategorySectionProps) {
    return (
        <SettingsSectionCard
            title={title}
            description={description}
            className={defaultOpen ? undefined : "is-collapsed"}
        >
            {children}
        </SettingsSectionCard>
    );
}
