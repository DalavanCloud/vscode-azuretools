/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringDictionary } from 'azure-arm-website/lib/models';
import * as azureStorage from "azure-storage";
import { ArgumentError } from '../errors';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { SiteClient } from '../SiteClient';
import { formatDeployLog } from './formatDeployLog';

/**
 * Method of deployment that is only intended to be used for Linux Consumption Function apps because it doesn't support kudu pushDeployment
 * To deploy with Run from Package on a Windows plan, create the app setting "WEBSITE_RUN_FROM_PACKAGE" and set it to "1".
 * Then deploy via "zipdeploy" as usual.
 */
export async function deployToStorageAccount(client: SiteClient, zipFilePath: string): Promise<void> {
    const blobName: string = azureStorage.date.secondsFromNow(0).toISOString().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').replace(/\s/g, '');

    const blobService: azureStorage.BlobService = await createBlobService(client);
    ext.outputChannel.appendLine(formatDeployLog(client, localize('creatingBlob', 'Uploading zip package to storage container...')));
    const blobUrl: string = await createBlobFromZip(blobService, zipFilePath, blobName);
    const appSettings: StringDictionary = await client.listApplicationSettings();
    if (appSettings.properties) {
        // They recently renamed 'ZIP' to 'PACKAGE'. However, they said 'ZIP' would be supported indefinitely, so we will use that until we're confident the 'PACKAGE' change has fully rolled out
        const WEBSITE_RUN_FROM_PACKAGE: string = 'WEBSITE_RUN_FROM_ZIP';
        appSettings.properties[WEBSITE_RUN_FROM_PACKAGE] = blobUrl;
    } else {
        throw new ArgumentError(appSettings);
    }
    await client.updateApplicationSettings(appSettings);
    ext.outputChannel.appendLine(formatDeployLog(client, localize('syncingTriggers', 'Syncing triggers...')));
    await client.syncFunctionTriggers();
}

async function createBlobService(client: SiteClient): Promise<azureStorage.BlobService> {
    let name: string | undefined;
    let key: string | undefined;
    // Use same storage account as AzureWebJobsStorage for deployments
    const azureWebJobsStorageKey: string = 'AzureWebJobsStorage';
    const settings: StringDictionary = await client.listApplicationSettings();
    if (settings.properties && settings.properties[azureWebJobsStorageKey]) {
        const accountName: RegExpMatchArray | null = settings.properties[azureWebJobsStorageKey].match(/AccountName=([^;]*);?/);
        const accountKey: RegExpMatchArray | null = settings.properties[azureWebJobsStorageKey].match(/AccountKey=([^;]*);?/);
        if (accountName && accountKey) {
            name = accountName[1];
            key = accountKey[1];
            return azureStorage.createBlobService(name, key);
        }
    }
    throw new Error(localize('"{0}" app setting is required for Run From Package deployment.', azureWebJobsStorageKey));
}

async function createBlobFromZip(blobService: azureStorage.BlobService, zipFilePath: string, blobName: string): Promise<string> {
    const containerName: string = 'azureappservice-run-from-package';
    await new Promise<void>((resolve: () => void, reject: (err: Error) => void): void => {
        blobService.createContainerIfNotExists(containerName, (err: Error) => {
            if (err !== null) {
                reject(err);
            } else {
                resolve();
            }
        });
    });

    await new Promise<void>((resolve: () => void, reject: (err: Error) => void): void => {
        blobService.createBlockBlobFromLocalFile(containerName, blobName, zipFilePath, (error: Error, _result: azureStorage.BlobService.BlobResult, _response: azureStorage.ServiceResponse) => {
            if (error !== null) {
                reject(error);

            } else {
                resolve();
            }
        });
    });
    const sasToken: string = blobService.generateSharedAccessSignature(containerName, blobName, <azureStorage.common.SharedAccessPolicy>{
        AccessPolicy: {
            Permissions: azureStorage.BlobUtilities.SharedAccessPermissions.READ + azureStorage.BlobUtilities.SharedAccessPermissions.LIST,
            Start: azureStorage.date.secondsFromNow(-10),
            // for clock desync
            Expiry: azureStorage.date.daysFromNow(365),
            ResourceTypes: azureStorage.BlobUtilities.BlobContainerPublicAccessType.BLOB
        }
    });

    return blobService.getUrl(containerName, blobName, sasToken, true);
}
