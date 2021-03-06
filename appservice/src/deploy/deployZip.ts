/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppServicePlan } from 'azure-arm-website/lib/models';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import KuduClient from 'vscode-azurekudu';
import { ext } from '../extensionVariables';
import * as FileUtilities from '../FileUtilities';
import { getKuduClient } from '../getKuduClient';
import { localize } from '../localize';
import { SiteClient } from '../SiteClient';
import { deployToStorageAccount } from './deployToStorageAccount';
import { formatDeployLog } from './formatDeployLog';
import { waitForDeploymentToComplete } from './waitForDeploymentToComplete';

export async function deployZip(client: SiteClient, fsPath: string, configurationSectionName: string, aspPromise: Promise<AppServicePlan>): Promise<void> {
    let zipFilePath: string;
    let createdZip: boolean = false;
    if (FileUtilities.getFileExtension(fsPath) === 'zip') {
        zipFilePath = fsPath;
    } else {
        createdZip = true;
        ext.outputChannel.appendLine(formatDeployLog(client, localize('zipCreate', 'Creating zip package...')));
        zipFilePath = await getZipFileToDeploy(fsPath, configurationSectionName);
    }

    try {
        ext.outputChannel.appendLine(formatDeployLog(client, localize('deployStart', 'Starting deployment...')));
        const asp: AppServicePlan = await aspPromise;
        // Assume it's consumption if we can't get the plan (sometimes happens with brand new plans). Consumption is recommended and more popular for functions
        const isConsumption: boolean = !asp || (asp.sku && asp.sku.tier && asp.sku.tier.toLowerCase() === 'dynamic');
        if (client.kind.toLowerCase().includes('linux') && isConsumption) {
            // Linux consumption doesn't support kudu zipPushDeploy
            await deployToStorageAccount(client, zipFilePath);
        } else {
            const kuduClient: KuduClient = await getKuduClient(client);
            await kuduClient.pushDeployment.zipPushDeploy(fs.createReadStream(zipFilePath), { isAsync: true });
            await waitForDeploymentToComplete(client, kuduClient);
        }
    } finally {
        if (createdZip) {
            await fse.remove(zipFilePath);
        }
    }
}

async function getZipFileToDeploy(fsPath: string, configurationSectionName?: string): Promise<string> {
    if (!(await fse.pathExists(fsPath))) {
        throw new Error('Could not zip a non-exist file path.');
    }
    if (await FileUtilities.isDirectory(fsPath)) {
        const zipDeployConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(configurationSectionName, vscode.Uri.file(fsPath));
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        const globPattern: string = zipDeployConfig.get<string>('zipGlobPattern');
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        const ignorePattern: string | string[] = zipDeployConfig.get<string | string[]>('zipIgnorePattern');
        return FileUtilities.zipDirectory(fsPath, globPattern, ignorePattern);
    } else {
        return FileUtilities.zipFile(fsPath);
    }
}
