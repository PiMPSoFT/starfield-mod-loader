import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, Output, EventEmitter, ViewChild } from "@angular/core";
import { AbstractControl, ControlValueAccessor, NG_VALUE_ACCESSOR, NgForm, ValidationErrors } from "@angular/forms";
import { AsyncState, ComponentState, ComponentStateRef, DeclareState, ManagedBehaviorSubject, ManagedSubject } from "@lithiumjs/angular";
import { Select } from "@ngxs/store";
import { FlatTreeControl } from "@angular/cdk/tree";
import { MatTreeFlatDataSource, MatTreeFlattener } from "@angular/material/tree";
import { BehaviorSubject, Observable } from "rxjs";
import { filter, map, switchMap, take } from "rxjs/operators";
import { BaseComponent } from "../../core/base-component";
import { filterDefined, filterTrue } from "../../core/operators";
import { ModImportRequest } from "../../models/mod-import-status";
import { AppProfile } from "../../models/app-profile";
import { AppState } from "../../state";
import { DialogManager } from "../../services/dialog-manager";

interface FileTreeNode {
    terminal: boolean;
    fullPath: string;
    pathPart: string;
    level: number;
    parent?: FileTreeNode;
    children?: FileTreeNode[];
    enabled$: BehaviorSubject<boolean>;
}

type FileTreeNodeRecord = Record<string, FileTreeNode>;

@Component({
    selector: "app-mod-import-options",
    templateUrl: "./mod-import-options.component.html",
    styleUrls: ["./mod-import-options.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        ComponentState.create(AppModImportOptionsComponent),
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: AppModImportOptionsComponent
        }
    ]
})
export class AppModImportOptionsComponent extends BaseComponent implements ControlValueAccessor {

    public readonly onFormSubmit$ = new ManagedSubject<NgForm>(this);

    @Select(AppState.getActiveProfile)
    public readonly activeProfile$!: Observable<AppProfile>;

    @Output("importRequestChange")
    public readonly importRequestChange$ = new EventEmitter<ModImportRequest>();

    @AsyncState()
    public readonly activeProfile!: AppProfile;

    @Input()
    public importRequest!: ModImportRequest;

    @ViewChild(NgForm)
    public readonly form!: NgForm;

    private readonly _fileNodeTransformer = (inputData: FileTreeNode, level: number): FileTreeNode => {
        return Object.assign(inputData, { level });
    };

    private _validateFilesEnabled = (_control: AbstractControl): ValidationErrors | null => {
        return this.importRequest.modFilePaths.some(({ enabled }) => enabled)
            ? null
            : { noFiles: true };
    };

    protected readonly nodeIsDir = (_level: number, node: FileTreeNode) => !node.terminal;

    protected readonly treeControl = new FlatTreeControl<FileTreeNode>(
        node => node.level,
        node => !node.terminal
    );

    protected readonly treeFlattener = new MatTreeFlattener(
        this._fileNodeTransformer,
        node => node.level,
        node => !node.terminal,
        node => node.children,
    );

    protected readonly filesDataSource = new MatTreeFlatDataSource(
        this.treeControl, this.treeFlattener
    );

    @DeclareState("fileDataInput")
    private _fileDataInput!: FileTreeNode[];

    @DeclareState("sfseDetected")
    private _sfseDetected: boolean = false;

    constructor(
        cdRef: ChangeDetectorRef,
        stateRef: ComponentStateRef<AppModImportOptionsComponent>,
        dialogManager: DialogManager
    ) {
        super({ cdRef });

        // Create a nested array of `FileTreeNode` objects based on `importRequest.modFilePaths`
        stateRef.get("importRequest").pipe(
            map((importRequest) => importRequest.modFilePaths.reduce((inputData, { filePath, enabled }) => {
                const pathParts = filePath.split(importRequest.filePathSeparator);
                let curPath = "";
                let parentInputData: FileTreeNode | undefined = undefined;
                pathParts.forEach((pathPart, index) => {
                    if (index > 0) {
                        curPath += importRequest.filePathSeparator;
                    }

                    curPath += pathPart;

                    const pathPartInputData = inputData[curPath] ?? {
                        pathPart,
                        fullPath: curPath,
                        parent: parentInputData,
                        enabled$: new ManagedBehaviorSubject<boolean>(this, enabled),
                        terminal: true
                    };

                    if (index < pathParts.length - 1) {
                        pathPartInputData.children ??= [];
                        pathPartInputData.terminal = false;
                    }

                    if (parentInputData && !parentInputData.children!.includes(pathPartInputData)) {
                        parentInputData.children!.push(pathPartInputData);
                    }

                    inputData[curPath] = pathPartInputData;
                    parentInputData = pathPartInputData;

                    // Check if this mod is using SFSE
                    if (pathPart.toLowerCase() === "sfse") {
                        this._sfseDetected = true;
                    }
                });

                return inputData;
            }, {} as FileTreeNodeRecord)),
            map(inputRecord => Object.values(inputRecord).filter(inputData => !inputData.parent)),
        ).subscribe(inputData => this._fileDataInput = inputData);

        // When `fileDataInput` changes, rebuild the tree
        stateRef.get("fileDataInput").subscribe((dataInput) => {
            this.filesDataSource.data = dataInput;

            const findRootNode = (nodes: FileTreeNode[]): FileTreeNode | undefined => {
                return nodes.reduce<FileTreeNode | undefined>((rootDirNode, node) => {
                    if (rootDirNode) {
                        return rootDirNode;
                    }
                    
                    if (this.importRequest.modSubdirRoot.toLowerCase().includes(node.fullPath.toLowerCase())) {
                        if (node.fullPath.toLowerCase() === this.importRequest.modSubdirRoot.toLowerCase()) {
                            return node;
                        } else if (!!node.children) {
                            return findRootNode(node.children);
                        }
                    }

                    return undefined;
                }, undefined);
            };

            // Find the root data dir node (if there is one) and expand it
            let rootDirNode = findRootNode(dataInput);
            while (rootDirNode) {
                this.treeControl.expand(rootDirNode);
                rootDirNode = rootDirNode.parent;
            }
        });

        // Add a validator for ensuring at least 1 file is selected
        stateRef.get("form").pipe(
            filterDefined()
        ).subscribe(({ form }) => form.addValidators([this._validateFilesEnabled]));

        // Warn user that mod uses SFSE if they aren't using SFSE
        stateRef.get("sfseDetected").pipe(
            filterTrue(),
            take(1),
            filter(() => !this.activeProfile.gameBinaryPath.toLowerCase().endsWith("sfse_loader.exe")),
            switchMap(() => dialogManager.createDefault(
                "This mod requires SFSE, but the active profile does not appear to be set up to use SFSE. Are you sure you want to continue?",
                [DialogManager.OK_ACTION_PRIMARY, DialogManager.CANCEL_ACTION],
                { hasBackdrop: true, disposeOnBackdropClick: false }
            ))
        ).subscribe((action) => {
            if (action === DialogManager.CANCEL_ACTION) {
                this.importRequest.importStatus = "CANCELED";
                this.onFormSubmit$.next(this.form);
            }
        });
    }

    public get sfseDetected(): boolean {
        return this._sfseDetected;
    }

    public get fileDataInput(): FileTreeNode[] {
        return this._fileDataInput;
    }

    public writeValue(importRequest: ModImportRequest): void {
        this.importRequest = importRequest;
    }

    public registerOnChange(fn: (importRequest: ModImportRequest) => void): void {
        this.importRequestChange$.subscribe(fn);
    }

    public registerOnTouched(_fn: any): void {
        throw new Error("Method not implemented.");
    }

    /**
     * @description Determines whether or not `node` is the root dir node. If `nestedCheck` is true,
     * it will also return `true` if `node` is a nested child of the root dir node.
     */
    protected isRootDirNode(node: FileTreeNode, nestedCheck = false): boolean {
        return nestedCheck
            ? node.fullPath.toLowerCase().includes(this.importRequest.modSubdirRoot.toLowerCase())
            : node.fullPath.toLowerCase() === this.importRequest.modSubdirRoot.toLowerCase();
    }

    /**
     * @description Determines whether or not the mod file for the given `node` is enabled.
     */
    protected isNodeEnabled$(node: FileTreeNode): Observable<boolean> {
        return node.enabled$.pipe(
            map(enabled => enabled && this.isRootDirNode(node, true))
        );
    }

    /**
     * @description Enables or disables the mod file for the given `node`.
     */
    protected setModFileEnabled(node: FileTreeNode, enabled: boolean): void {
        // Update the `node` enabled status
        node.enabled$.next(enabled);

        // Update the `node` children enabled status
        node.children?.forEach(childNode => this.setModFileEnabled(childNode, enabled));

        // Update the mod file status in `importRequest`
        const modPath = this.importRequest.modFilePaths.find(({ filePath }) => filePath === node.fullPath);
        if (modPath) {
            modPath.enabled = enabled;
        }

        // Update form validation
        this.form.form.updateValueAndValidity();
    }

    /**
     * @description Makes `modSubdirRoot` the new root dir.
     */
    protected setModRootSubdir(modSubdirRoot: string): void {
        this.importRequest = Object.assign(this.importRequest, { modSubdirRoot });
    }
}