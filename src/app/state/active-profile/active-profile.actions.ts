import { ModProfileRef } from "../../models/mod-profile-ref";
import { AppProfile } from "../../models/app-profile";
import { BasicAction } from "../basic-action";

export namespace ActiveProfileActions {

    function createBasicAction(property: keyof AppProfile, action: string): BasicAction.Constructor<AppProfile, keyof AppProfile> {
        return BasicAction.create<AppProfile, keyof AppProfile>(
            "project",
            action,
            property
        );
    }

    function createUpdateAction(property: keyof AppProfile): BasicAction.Constructor<AppProfile, keyof AppProfile> {
        return createBasicAction(property, "update");
    }

    export class AddMod {
        public static readonly type = `[activeProfile] add mod`;

        constructor(
            public name: string,
            public mod: ModProfileRef
        ) {}
    }
}