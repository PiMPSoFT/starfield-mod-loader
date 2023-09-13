import * as _ from "lodash";
import { Inject, Injectable, forwardRef } from "@angular/core";
import { Select, Store } from "@ngxs/store";
import { AppMessageHandler } from "./app-message-handler";
import { delay, distinctUntilChanged, filter, map, switchMap, take, tap, toArray } from "rxjs/operators";
import { Observable, combineLatest, concat, of } from "rxjs";
import { filterDefined } from "../core/operators/filter-defined";
import { ElectronUtils } from "../util/electron-utils";
import { ObservableUtils } from "../util/observable-utils";
import { AppSettingsUserCfg } from "../models/app-settings-user-cfg";
import { AppProfile } from "../models/app-profile";
import { AppActions, AppState } from "../state";
import { AppData } from "../models/app-data";
import { ActiveProfileActions } from "../state/active-profile/active-profile.actions";
import { ModProfileRef } from "../models/mod-profile-ref";
import { OverlayHelpers, OverlayHelpersRef } from "./overlay-helpers";
import { AppProfileSettingsModal } from "../modals/profile-settings";

@Injectable({ providedIn: "root" })
export class ProfileManager {

    @Select(AppState)
    public readonly appState$!: Observable<AppData>;

    @Select(AppState.getActiveProfile)
    public readonly activeProfile$!: Observable<AppProfile | undefined>;

    @Select(AppState.isModsActivated)
    public readonly isModsActivated$!: Observable<boolean>;

    constructor(
        messageHandler: AppMessageHandler,
        @Inject(forwardRef(() => Store)) private readonly store: Store,
        private readonly overlayHelpers: OverlayHelpers
    ) {
        messageHandler.messages$.pipe(
            filter(message => message.id === "profile:addMod"),
            switchMap(() => this.addModFromUser())
        ).subscribe();

        messageHandler.messages$.pipe(
            filter(message => message.id === "profile:settings"),
            switchMap(() => this.showProfileSettings())
        ).subscribe();
        
        // Wait for NGXS to load
        of(true).pipe(delay(0)).subscribe(() => {
            // Load app settings from disk
            this.loadSettings();

            // Save app settings to disk on changes
            this.appState$.pipe(
                filterDefined(),
                switchMap(() => this.saveSettings())
            ).subscribe();

            // Save profile settings to disk on changes
            this.activeProfile$.pipe(
                filterDefined(),
                switchMap(profile => this.saveProfile(profile))
            ).subscribe();

            combineLatest([
                this.activeProfile$,
                this.isModsActivated$,
            ]).pipe(
                filter(([activeProfile]) => !!activeProfile),
                distinctUntilChanged((a, b) => _.isEqual(a, b)),
                switchMap(([, activated]) => {
                    if (activated) {
                        return this.deployActiveMods();
                    } else {
                        return this.undeployMods();
                    }
                })
            ).subscribe();
        });
    }

    public loadSettings(): Observable<AppData> {
        return ObservableUtils.hotResult$(ElectronUtils.invoke<AppSettingsUserCfg | null>("app:loadSettings").pipe(
            tap((settings) => {
                if (settings?.activeProfile) {
                    this.loadProfile(settings.activeProfile, true);
                } else {
                    this.createProfile("Default", true);
                    this.saveSettings();
                }

                this.activateMods(settings?.modsActivated);
            }),
            switchMap(() => this.appState$.pipe(take(1)))
        ));
    }

    public saveSettings(): Observable<void> {
        return ObservableUtils.hotResult$(this.appState$.pipe(
            take(1),
            map(appState => this.appDataToUserCfg(appState)),
            switchMap(settings => ElectronUtils.invoke("app:saveSettings", { settings }))
        ));
    }

    public activateMods(activate: boolean = true): Observable<void> {
        return this.store.dispatch(new AppActions.activateMods(activate));
    }

    public reactivateMods(): Observable<any> {
        return concat([
            this.activateMods(false),
            this.activateMods(true),
        ]).pipe(
            toArray()
        );
    }

    public loadProfile(profileName: string, setActive: boolean = true): Observable<AppProfile> {
        return ObservableUtils.hotResult$(ElectronUtils.invoke<AppProfile>("app:loadProfile", { name: profileName }).pipe(
            switchMap((profile) => {
                if (!profile) {
                    // TODO - Show error
                    return this.createProfile(profileName);
                }

                if (setActive) {
                    this.setActiveProfile(profile);
                }

                return of(profile);
            })
        ));
    }

    public saveProfile(profile: AppProfile): Observable<any> {
        return ObservableUtils.hotResult$(
            ElectronUtils.invoke<AppProfile>("app:saveProfile", { profile })
        );
    }

    public createProfile(profileName: string, setActive: boolean = true): Observable<AppProfile> {
        const profile = AppProfile.create(profileName);

        if (setActive) {
            this.setActiveProfile(profile);
        }

        return this.saveProfile(profile);
    }

    public setActiveProfile(profile: AppProfile): Observable<any> {
        return this.store.dispatch(new AppActions.updateActiveProfile(profile));
    }

    public showProfileSettings(): Observable<OverlayHelpersRef> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            filterDefined(),
            map((activeProfile) => {
                const modContextMenuRef = this.overlayHelpers.createFullScreen(AppProfileSettingsModal, {
                    center: true,
                    hasBackdrop: true,
                    disposeOnBackdropClick: false,
                    minWidth: "24rem",
                    width: "40%",
                    height: "75%",
                    panelClass: "mat-app-background"
                });

                modContextMenuRef.component.instance.profile = activeProfile;
                return modContextMenuRef;
            })
        ));
    }

    public addModFromUser(): Observable<ModProfileRef> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            switchMap((activeProfile) => ElectronUtils.invoke("profile:addMod", { profile: activeProfile })),
            tap((result) => {
                if (!result) {
                    alert("Failed to add mod.");
                }
            }),
            filterDefined(),
            switchMap(({ name, modRef }) => this.store.dispatch(new ActiveProfileActions.AddMod(name, modRef)).pipe(
                map(() => modRef)
            ))
        ));
    }

    public updateMod(name: string, modRef: ModProfileRef): Observable<void> {
        return this.store.dispatch(new ActiveProfileActions.AddMod(name, modRef));
    }

    public deleteMod(name: string): Observable<void> {
        return this.store.dispatch(new ActiveProfileActions.DeleteMod(name));
    }

    public reorderMods(modOrder: string[]): Observable<void> {
        return this.store.dispatch(new ActiveProfileActions.ReorderMods(modOrder));
    }

    public showModInFileExplorer(modRef: ModProfileRef): Observable<void> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            switchMap(profile => ElectronUtils.invoke("profile:showModInFileExplorer", { profile, modRef })
        )));
    }

    public showProfileBaseDirInFileExplorer(): Observable<void> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            switchMap(profile => ElectronUtils.invoke("profile:showProfileBaseDirInFileExplorer", { profile })
        )));
    }

    public showProfileModsDirInFileExplorer(): Observable<void> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            switchMap(profile => ElectronUtils.invoke("profile:showProfileModsDirInFileExplorer", { profile })
        )));
    }

    public showModBaseDirInFileExplorer(): Observable<void> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            switchMap(profile => ElectronUtils.invoke("profile:showModBaseDirInFileExplorer", { profile })
        )));
    }

    public showGameBaseDirInFileExplorer(): Observable<void> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            switchMap(profile => ElectronUtils.invoke("profile:showGameBaseDirInFileExplorer", { profile })
        )));
    }

    public launchGame(): Observable<void> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            switchMap(profile => ElectronUtils.invoke("profile:launchGame", { profile })
        )));
    }

    private deployActiveMods(): Observable<any> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            switchMap((activeProfile) => ElectronUtils.invoke("profile:deploy", { profile: activeProfile }))
        ));
    }

    private undeployMods(): Observable<any> {
        return ObservableUtils.hotResult$(this.activeProfile$.pipe(
            take(1),
            switchMap((activeProfile) => ElectronUtils.invoke("profile:undeploy", { profile: activeProfile }))
        ));
    }

    private appDataToUserCfg(appData: AppData): AppSettingsUserCfg {
        return {
            activeProfile: appData.activeProfile?.name,
            modsActivated: appData.modsActivated
        };
    }
}