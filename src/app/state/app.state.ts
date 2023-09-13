import * as _ from "lodash";
import { AppData } from "../models/app-data";
import { Injectable } from '@angular/core';
import { State, Selector, Action, StateContext } from "@ngxs/store";
import { AppActions } from './app.actions';
import { AppProfile } from "../models/app-profile";
import { ActiveProfileState } from "./active-profile/active-profile.state";

@State<AppData>({
    name: "app",
    defaults: {
        modsActivated: false
    },
    children: [ActiveProfileState]
})
@Injectable()
export class AppState {
    
    @Selector()
    public static getActiveProfile(state: AppData): AppProfile | undefined {
        return state.activeProfile;
    }

    @Selector()
    public static isModsActivated(state: AppData): boolean {
        return state.modsActivated;
    }

    @Action(AppActions.updateActiveProfile)
    public updateActiveProfile(context: AppState.Context, state: AppActions.ActiveProfileAction): void {
        context.patchState(_.cloneDeep(state));
    }

    @Action(AppActions.activateMods)
    public activateMods(context: AppState.Context, state: AppActions.ModsActivatedAction): void {
        context.patchState(_.cloneDeep(state));
    }
}

export namespace AppState {

    export type Context = StateContext<AppData>;
}
