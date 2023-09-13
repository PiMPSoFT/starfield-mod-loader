import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from "@angular/core";
import { ComponentState, AsyncState } from "@lithiumjs/angular";
import { Select } from "@ngxs/store";
import { AppState } from "../../state";
import { BasePage } from "../../core/base-page";
import { Observable } from "rxjs";
import { AppProfile } from "../../models/app-profile";
import { ModProfileRef } from "src/app/models/mod-profile-ref";
import { ProfileManager } from "src/app/services/profile-manager";

@Component({
    selector: "app-mods-overview-page",
    templateUrl: "./mods-overview.page.html",
    styleUrls: ["./mods-overview.page.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [ComponentState.create(AppModsOverviewPage)]
})
export class AppModsOverviewPage extends BasePage {

    @Select(AppState.getActiveProfile)
    public readonly activeProfile$!: Observable<AppProfile | undefined>;

    @AsyncState()
    public readonly activeProfile?: AppProfile;

    constructor(
        cdRef: ChangeDetectorRef,
        private readonly profileManager: ProfileManager
    ) {
        super({ cdRef });
    }

    protected registerModUpdate(name: string, mod: ModProfileRef): Observable<void> {
        return this.profileManager.updateMod(name, mod);
    }
}