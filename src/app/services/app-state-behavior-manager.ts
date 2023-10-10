import { Inject, Injectable, forwardRef } from "@angular/core";
import { Select, Store } from "@ngxs/store";
import { EMPTY, Observable } from "rxjs";
import { distinctUntilChanged, filter, switchMap } from "rxjs/operators";
import { AppMessageData } from "../models/app-message";
import { AppActions, AppState } from "../state";
import { AppMessageHandler } from "./app-message-handler";
import { OverlayHelpers, OverlayHelpersRef } from "./overlay-helpers";
import { AppModSyncIndicatorModal, LOADING_MSG_TOKEN } from "../modals/loading-indicator";
import { AppAboutInfoModal, DEPS_INFO_TOKEN } from "../modals/app-about-info";

@Injectable({ providedIn: "root" })
export class AppStateBehaviorManager {

    @Select(AppState.isDeployInProgress)
    public readonly isDeployInProgress$!: Observable<boolean>;

    constructor(
        messageHandler: AppMessageHandler,
        @Inject(forwardRef(() => Store)) private readonly store: Store,
        private readonly overlayHelpers: OverlayHelpers
    ) {
        let deployInProgressOverlayRef: OverlayHelpersRef | undefined;

        messageHandler.messages$.pipe(
            filter(message => message.id === "app:showAboutInfo")
        ).subscribe(({ data }) => this.showAppAboutInfo(
            data as AppMessageData<"app:showAboutInfo"> // TODO
        ));

        messageHandler.messages$.pipe(
            filter(message => message.id === "app:toggleModListColumn"),
            switchMap(({ data }) => {
                const _data = data as AppMessageData<"app:toggleModListColumn">; // TODO

                if (!!_data.column) {
                    return this.toggleModListColumn(_data.column);
                } else if (_data.reset) {
                    return this.resetModListColumns();
                }

                return EMPTY;
            })
        ).subscribe();

        // Show a loading indicator when app is syncing mod files to base deployment dir
        this.isDeployInProgress$.pipe(
            distinctUntilChanged()
        ).subscribe((deployInProgress) => {
            if (deployInProgress && !deployInProgressOverlayRef) {
                deployInProgressOverlayRef = this.showLoadingIndicator("Syncing mods...");

                deployInProgressOverlayRef.onClose$.subscribe(() => deployInProgressOverlayRef = undefined);
            } else if (!!deployInProgressOverlayRef) {
                deployInProgressOverlayRef.close();
            }
        });
    }

    public showLoadingIndicator(loadingMsg: string): OverlayHelpersRef {
        return this.overlayHelpers.createFullScreen(AppModSyncIndicatorModal, {
            width: "auto",
            height: "auto",
            minHeight: "10%",
            center: true,
            hasBackdrop: true,
            disposeOnBackdropClick: false,
            panelClass: "mat-app-background"
        }, [[LOADING_MSG_TOKEN, loadingMsg]]);
    }

    public toggleModListColumn(column: string): Observable<void> {
        return this.store.dispatch(new AppActions.ToggleModListColumn(column));
    }

    public resetModListColumns(): Observable<void> {
        return this.store.dispatch(new AppActions.ResetModListColumns());
    }

    public showAppAboutInfo(aboutData: AppMessageData<"app:showAboutInfo">): void {
        this.overlayHelpers.createFullScreen(AppAboutInfoModal, {
            width: "50vw",
            height: "auto",
            maxHeight: "75vh",
            center: true,
            hasBackdrop: true,
            disposeOnBackdropClick: true,
            panelClass: "mat-app-background"
        }, [[DEPS_INFO_TOKEN, aboutData]]);
    }
}