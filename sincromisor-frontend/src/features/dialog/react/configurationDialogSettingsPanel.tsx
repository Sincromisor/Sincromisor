import { useLayoutEffect, useRef, useState } from "react";
import { SettingsShell } from "../../settings/react/shell/settingsShell";
import { StartupMediaNotice } from "./components/startupMediaNotice";
import { ConfigurationDialogOverview } from "./configurationDialogOverview";
import "./configurationDialogSettings.css";
import { ConfigurationDialogSettingsFooter } from "./configurationDialogSettingsFooter";
import { createConfigurationDialogSettingsPages } from "./configurationDialogSettingsPages";
import { useConfigurationDialogVrmDragDrop } from "./configurationDialogVrmDragDrop";
import { useConfigurationDialogVrmFilePicker } from "./configurationDialogVrmFilePicker";
import { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

/** 概要と詳細の表示だけを切り替え、設定・VRM操作・開始条件は同じ所有者を使う。 */
export function ConfigurationDialogSettingsPanel() {
    const [showDetails, setShowDetails] = useState(false);
    const panelRef = useRef<HTMLFieldSetElement>(null);
    const firstRender = useRef(true);
    // 表示切り替えで元のボタンが消えるため、新しい表示の同じ操作へ戻す。
    // biome-ignore lint/correctness/useExhaustiveDependencies: 概要・詳細の切り替え直後だけ移動し、通常の設定更新では入力から奪わない。
    useLayoutEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        panelRef.current?.querySelector<HTMLButtonElement>("[data-startup-view-toggle]")?.focus();
    }, [showDetails]);
    const state = useConfigurationDialogSettingsState();
    const { currentController, dialogUiState, dialogVrmUiState, startApp } = state;
    const { vrmFileInputRef, handleOpenVrmFilePicker, handleVrmFileInputChange } =
        useConfigurationDialogVrmFilePicker({
            applySelectedVrmFile: state.applySelectedVrmFile,
        });
    const dragDrop = useConfigurationDialogVrmDragDrop({
        isDragOver: dialogVrmUiState.isDragOver,
        applySelectedVrmFile: state.applySelectedVrmFile,
        setVrmDragOver: state.setVrmDragOver,
    });
    const pages = createConfigurationDialogSettingsPages({
        state,
        onOpenFilePicker: handleOpenVrmFilePicker,
    });

    return (
        <fieldset
            ref={panelRef}
            className={`configurationDialogReactSettingsPanel${dialogVrmUiState.isDragOver ? " is-dragover" : ""}`}
            onDragEnter={dragDrop.handleDialogDragEnter}
            onDragOver={dragDrop.handleDialogDragOver}
            onDragLeave={dragDrop.handleDialogDragLeave}
            onDrop={dragDrop.handleDialogDrop}
        >
            <legend className="configurationDialogReactSettingsPanel__legend">
                VRMファイル設定
            </legend>
            <input
                ref={vrmFileInputRef}
                type="file"
                accept=".vrm"
                className="configurationDialogReactSettingsPanel__fileInput"
                tabIndex={-1}
                onChange={handleVrmFileInputChange}
            />
            {showDetails ? (
                <SettingsShell
                    ariaLabel="起動前の詳しい設定"
                    title="詳しい設定"
                    titleId="configuration-dialog-title"
                    className="settingsShell--startupDialog"
                    navigationPlacement="top"
                    responsiveMode="container"
                    initialPageId="experience"
                    pages={pages}
                    scrollEnd={<StartupMediaNotice settings={state.settings} />}
                    footer={
                        <ConfigurationDialogSettingsFooter
                            currentController={currentController}
                            dialogUiState={dialogUiState}
                            startApp={startApp}
                            showDetails={showDetails}
                            onToggleDetails={() => setShowDetails(!showDetails)}
                        />
                    }
                />
            ) : (
                <section
                    className="settingsShell is-containerResponsive configurationDialogReactSettingsPanel__summary"
                    aria-label="開始前の確認"
                >
                    <h1 id="configuration-dialog-title">開始前の確認</h1>
                    <ConfigurationDialogOverview
                        state={state}
                        onOpenFilePicker={handleOpenVrmFilePicker}
                    />
                    <div className="settingsShell__footer">
                        <ConfigurationDialogSettingsFooter
                            currentController={currentController}
                            dialogUiState={dialogUiState}
                            startApp={startApp}
                            showDetails={showDetails}
                            onToggleDetails={() => setShowDetails(true)}
                        />
                    </div>
                </section>
            )}
        </fieldset>
    );
}
