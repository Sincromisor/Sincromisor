import { SettingsShell } from "../../settings/react/shell/settingsShell";
import "./configurationDialogSettings.css";
import { ConfigurationDialogSettingsFooter } from "./configurationDialogSettingsFooter";
import { createConfigurationDialogSettingsPages } from "./configurationDialogSettingsPages";
import { useConfigurationDialogVrmDragDrop } from "./configurationDialogVrmDragDrop";
import { useConfigurationDialogVrmFilePicker } from "./configurationDialogVrmFilePicker";
import { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

// 起動前 dialog の見た目/操作を React 側で主導する設定パネル。
// HTMLDialogElement 以外の visible UI と VRM file 操作は React 正規経路に寄せる。
export function ConfigurationDialogSettingsPanel() {
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
            <SettingsShell
                ariaLabel="初回セットアップウィザード"
                title="初回セットアップ"
                navigationPlacement="top"
                initialPageId="conversation"
                pages={pages}
                footer={
                    <ConfigurationDialogSettingsFooter
                        currentController={currentController}
                        dialogUiState={dialogUiState}
                        startApp={startApp}
                    />
                }
            />
        </fieldset>
    );
}
