import { useState } from "react";
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
                    className="configurationDialogReactSettingsPanel__summary"
                    aria-label="開始前の確認"
                >
                    <h1>開始前の確認</h1>
                    <ConfigurationDialogOverview
                        state={state}
                        onOpenFilePicker={handleOpenVrmFilePicker}
                    />
                    <ConfigurationDialogSettingsFooter
                        currentController={currentController}
                        dialogUiState={dialogUiState}
                        startApp={startApp}
                        showDetails={showDetails}
                        onToggleDetails={() => setShowDetails(true)}
                    />
                </section>
            )}
        </fieldset>
    );
}
