/**
 * Tabula Bridge - Portus ↔ Tabula Integration
 * 
 * Handles the synchronization of completed tasks from Portus
 * to Tabula draft invoices. Critical mission: zero data loss.
 * 
 * @version 1.0.0
 * @since 2026-01-23
 */

import { App, Notice, TFile } from 'obsidian';
import { Item } from './components/types';

// ============================================================================
// Configuration
// ============================================================================

const DRAFTS_FOLDER = 'Invoices/Drafts';
const ARCHIVE_FOLDER = 'Invoices/Archive';
const TRANSACTION_LOG_PATH = 'Invoices/_sync_log.md';

// Client route configuration (mirrored from Tabula invoiceRouter.ts)
interface ClientRoute {
    prefix: string;
    keywords: string[];
    clientName: string;
    monthlyTagging: boolean;
    defaultRate: number;
}

const CLIENT_ROUTES: ClientRoute[] = [
    {
        prefix: 'PEP',
        keywords: [
            'pep', 'peprealestate', 'pep real estate',
            'spring', 'mercer', 'crosby', 'howard',
            'douglass', 'charles', 'washington',
            'costar', 'loopnet', 'crexi', 'commercialedge', 'streeteasy',
            'matterport', 'listing', 'email blast'
        ],
        clientName: 'PEP Real Estate',
        monthlyTagging: true,
        defaultRate: 41.25,
    },
    {
        prefix: 'SHO',
        keywords: ['soho johnny', 'sohojohnny', 'soho records'],
        clientName: 'SoHoJohnny LLC',
        monthlyTagging: false,
        defaultRate: 50.00,
    },
    {
        // JPA-44D: Decatur properties (44-46 Decatur Street)
        prefix: 'JPA-44D',
        keywords: [
            '4446 decatur', '44-46 decatur', '44 decatur', '46 decatur',
            'decatur street', 'decatur'
        ],
        clientName: 'JP Associates II LLC (Decatur)',
        monthlyTagging: true,
        defaultRate: 50.00,
    },
    {
        // JPA-53W: 53 Wooster Street
        prefix: 'JPA-53W',
        keywords: [
            '53 wooster', 'wooster street', 'wooster'
        ],
        clientName: 'JP Associates II LLC (53 Wooster)',
        monthlyTagging: true,
        defaultRate: 50.00,
    },
    {
        // Fallback JPA for general JP Associates tasks
        prefix: 'JPA',
        keywords: ['pasquali', 'jp associates', 'jpa'],
        clientName: 'JP Associates II LLC',
        monthlyTagging: true,
        defaultRate: 50.00,
    },
    {
        prefix: 'ROC',
        keywords: ['rock nyc', 'rock new york'],
        clientName: 'Rock NYC',
        monthlyTagging: false,
        defaultRate: 50.00,
    },
    {
        prefix: 'LMH',
        keywords: ['let me help', 'letmehelp'],
        clientName: 'Let Me Help Inc.',
        monthlyTagging: false,
        defaultRate: 50.00,
    },
    {
        prefix: 'TRB',
        keywords: ['tribeca records', 'tribeca'],
        clientName: 'Tribeca Records',
        monthlyTagging: false,
        defaultRate: 50.00,
    },
];

const DEFAULT_ROUTE: ClientRoute = {
    prefix: 'PEP',
    keywords: [],
    clientName: 'PEP Real Estate',
    monthlyTagging: true,
    defaultRate: 41.25,
};

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
    success: boolean;
    invoicePath: string | null;
    lineItemDescription: string;
    error: string | null;
    timestamp: string;
}

// ============================================================================
// TabulaBridge Class
// ============================================================================

export class TabulaBridge {
    private app: App;
    private syncLog: SyncResult[] = [];

    constructor(app: App) {
        this.app = app;
        console.log('[TabulaBridge] Initialized');
    }

    /**
     * Sync a completed task to the appropriate invoice draft.
     * This is the main entry point called from StateManager.
     */
    async syncTaskToInvoice(item: Item): Promise<SyncResult> {
        const timestamp = new Date().toISOString();
        const taskTitle = item.data.titleRaw || item.data.title || '';

        console.log(`[TabulaBridge] Syncing task: "${taskTitle.slice(0, 60)}..."`);

        try {
            // 1. Resolve which client/invoice this task belongs to
            const route = this.resolveClientRoute(taskTitle);
            console.log(`[TabulaBridge] Resolved route: ${route.prefix} (${route.clientName})`);

            // 2. Find the latest draft invoice for this client
            let draftInfo = await this.findLatestDraft(route.prefix);

            if (!draftInfo) {
                // Auto-generate a new draft invoice
                console.log(`[TabulaBridge] No draft found for ${route.prefix}, auto-generating...`);
                const newDraft = await this.createDraftFromTemplate(route);
                new Notice(`📄 Created new invoice: ${newDraft.basename}`, 5000);
                draftInfo = { file: newDraft, content: await this.app.vault.read(newDraft) };
            }

            // 3. Append task as line item to the invoice
            await this.appendLineItem(draftInfo.file, taskTitle, route);

            // 4. Success!
            const result = this.createResult(true, draftInfo.file.path, taskTitle, null, timestamp);
            new Notice(`✅ Synced to ${draftInfo.file.basename}`, 3000);

            // Log the transaction
            await this.logTransaction(result);

            return result;

        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            console.error('[TabulaBridge] Sync failed:', error);
            new Notice(`⚠️ Invoice sync failed: ${error.slice(0, 80)}`, 10000);

            const result = this.createResult(false, null, taskTitle, error, timestamp);
            await this.logTransaction(result);

            return result;
        }
    }

    /**
     * Resolve which client route applies to a task based on:
     * 1. Explicit [client::XXX] field (v5.0 - primary)
     * 2. Legacy [invoice::XXX] metadata
     * 3. Keyword matching (fallback)
     */
    private resolveClientRoute(taskContent: string): ClientRoute {
        const content = taskContent.toLowerCase();

        // v5.0: Check for explicit [client::XXX] field (primary lookup)
        const clientMatch = taskContent.match(/\[client::([^\]]+)\]/i);
        if (clientMatch) {
            const explicitClient = clientMatch[1].trim().toUpperCase();
            // Match prefix case-insensitively
            const clientRoute = CLIENT_ROUTES.find(r => r.prefix.toUpperCase() === explicitClient);
            if (clientRoute) {
                console.log(`[TabulaBridge] Using explicit client: ${clientRoute.prefix}`);
                return clientRoute;
            }
        }

        // Legacy: Check for explicit [invoice::XXX] metadata
        const invoiceMatch = content.match(/\[invoice::([^\]]+)\]/);
        if (invoiceMatch) {
            const explicitPrefix = invoiceMatch[1].split('-')[0].toUpperCase();
            const explicitRoute = CLIENT_ROUTES.find(r => r.prefix === explicitPrefix);
            if (explicitRoute) return explicitRoute;
        }

        // Keyword matching (fallback)
        for (const route of CLIENT_ROUTES) {
            for (const keyword of route.keywords) {
                if (content.includes(keyword.toLowerCase())) {
                    return route;
                }
            }
        }

        // Default to PEP Real Estate
        return DEFAULT_ROUTE;
    }

    /**
     * Find the most recent draft invoice for a given client prefix.
     */
    private async findLatestDraft(prefix: string): Promise<{ file: TFile; content: string } | null> {
        const files = this.app.vault.getMarkdownFiles().filter(f =>
            f.path.startsWith(DRAFTS_FOLDER) &&
            f.basename.startsWith(prefix + '-') &&
            f.extension === 'md'
        );

        if (files.length === 0) {
            return null;
        }

        // Sort by invoice number (descending)
        files.sort((a, b) => {
            const numA = parseInt(a.basename.split('-')[1]) || 0;
            const numB = parseInt(b.basename.split('-')[1]) || 0;
            return numB - numA;
        });

        const latestFile = files[0];
        const content = await this.app.vault.read(latestFile);

        // Check if it's still a draft
        if (content.includes('status: draft') || content.includes('Status:** Draft')) {
            return { file: latestFile, content };
        }

        return null;
    }

    /**
     * Find the highest invoice number for a given prefix across Drafts and Archive.
     */
    private findLatestInvoiceNumber(prefix: string): number {
        const allFiles = this.app.vault.getMarkdownFiles().filter(f =>
            (f.path.startsWith(DRAFTS_FOLDER) || f.path.startsWith(ARCHIVE_FOLDER)) &&
            f.basename.startsWith(prefix + '-') &&
            f.extension === 'md'
        );

        let maxNum = 0;
        for (const file of allFiles) {
            // Handle both PREFIX-NNN and PREFIX-XXX-NNN patterns
            const parts = file.basename.split('-');
            const numPart = parts[parts.length - 1];
            const num = parseInt(numPart) || 0;
            if (num > maxNum) maxNum = num;
        }

        return maxNum;
    }

    /**
     * Create a new draft invoice from the most recent template for this client.
     */
    private async createDraftFromTemplate(route: ClientRoute): Promise<TFile> {
        const nextNum = this.findLatestInvoiceNumber(route.prefix) + 1;
        const invoiceCode = `${route.prefix}-${String(nextNum).padStart(3, '0')}`;
        const filename = `${invoiceCode}.md`;
        const filepath = `${DRAFTS_FOLDER}/${filename}`;

        console.log(`[TabulaBridge] Creating new invoice: ${invoiceCode}`);

        // Find most recent invoice for this client (draft or archived) to use as template
        const templateFile = await this.findTemplateForClient(route.prefix);

        let content: string;
        if (templateFile) {
            content = await this.generateFromTemplate(templateFile, route, invoiceCode);
        } else {
            content = this.generateBlankInvoice(route, invoiceCode);
        }

        // Create the new file
        const newFile = await this.app.vault.create(filepath, content);
        console.log(`[TabulaBridge] ✅ Created ${filepath}`);

        return newFile;
    }

    /**
     * Find the most recent invoice (draft or archived) to use as a template.
     */
    private async findTemplateForClient(prefix: string): Promise<TFile | null> {
        const allFiles = this.app.vault.getMarkdownFiles().filter(f =>
            (f.path.startsWith(DRAFTS_FOLDER) || f.path.startsWith(ARCHIVE_FOLDER)) &&
            f.basename.startsWith(prefix + '-') &&
            f.extension === 'md'
        );

        if (allFiles.length === 0) return null;

        // Sort by invoice number (descending) to get the most recent
        allFiles.sort((a, b) => {
            const partsA = a.basename.split('-');
            const partsB = b.basename.split('-');
            const numA = parseInt(partsA[partsA.length - 1]) || 0;
            const numB = parseInt(partsB[partsB.length - 1]) || 0;
            return numB - numA;
        });

        return allFiles[0];
    }

    /**
     * Generate a new invoice from an existing template.
     */
    private async generateFromTemplate(template: TFile, route: ClientRoute, invoiceCode: string): Promise<string> {
        const templateContent = await this.app.vault.read(template);

        // Parse dates
        const now = new Date();
        const issueDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        // Build new invoice header
        const header = `# ${route.clientName} | ${invoiceCode}

**Client:** ${route.clientName}  
**Period:**   
**Invoice #:** ${invoiceCode}  
**Issue Date:** ${issueDate} | **Due:** ${dueDate}  
**Status:** Draft | **Total:** $0.00

## Line Items

| Date | Description | Qty | Amount |
|:-----|:------------|----:|-------:|

## Totals

**Subtotal:** $0.00  
**Total:** $0.00

---
tabula: true
status: draft
client: ${route.clientName}
period: ""
invoice_number: ${invoiceCode}
invoice_title: ${route.clientName}
total: 0
ready_to_send: false
stripe_id: 
stripe_status: 
sync_status: pending
tags: [invoice, draft]
---
`;

        return header;
    }

    /**
     * Generate a blank invoice when no template exists.
     */
    private generateBlankInvoice(route: ClientRoute, invoiceCode: string): string {
        const now = new Date();
        const issueDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        return `# ${route.clientName} | ${invoiceCode}

**Client:** ${route.clientName}  
**Period:**   
**Invoice #:** ${invoiceCode}  
**Issue Date:** ${issueDate} | **Due:** ${dueDate}  
**Status:** Draft | **Total:** $0.00

## Line Items

| Date | Description | Qty | Amount |
|:-----|:------------|----:|-------:|

## Totals

**Subtotal:** $0.00  
**Total:** $0.00

---
tabula: true
status: draft
client: ${route.clientName}
period: ""
invoice_number: ${invoiceCode}
invoice_title: ${route.clientName}
total: 0
ready_to_send: false
stripe_id: 
stripe_status: 
sync_status: pending
tags: [invoice, draft]
---
`;
    }

    /**
     * Append a line item to an invoice markdown file.
     */
    private async appendLineItem(file: TFile, taskTitle: string, route: ClientRoute): Promise<void> {
        const content = await this.app.vault.read(file);

        // Clean up task title (remove metadata markers)
        let description = taskTitle
            .replace(/\[priority::[^\]]+\]/g, '')
            .replace(/\[notes::[\s\S]*?\]/g, '')  // Multi-line notes
            .replace(/\[invoice::[^\]]+\]/g, '')
            .replace(/\[client::[^\]]+\]/g, '')   // v5.0 client routing field
            .replace(/\[month::[^\]]+\]/g, '')
            .replace(/@\{\d{4}-\d{2}-\d{2}\}/g, '')
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .trim();

        // Escape pipes for markdown table
        description = description.replace(/\|/g, '\\|');

        // Get today's date in MM-DD format
        const now = new Date();
        const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Create new line item row
        const newRow = `| ${dateStr} |  | ${description} |  |  |`;

        // Find the line items table and append
        const lines = content.split('\n');
        let insertIndex = -1;
        let inLineItems = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Look for the line items table header
            if (line.includes('| Date') && (line.includes('| Description') || line.includes('| End'))) {
                inLineItems = true;
                continue;
            }

            // Skip the separator line
            if (inLineItems && line.startsWith('|:') || line.startsWith('| :')) {
                continue;
            }

            // We're in the table body
            if (inLineItems) {
                // If we hit a non-table line, insert before it
                if (!line.startsWith('|') || line.trim() === '') {
                    insertIndex = i;
                    break;
                }
            }
        }

        if (insertIndex === -1) {
            // Fallback: find "## Totals" and insert before it
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('## Totals')) {
                    insertIndex = i;
                    break;
                }
            }
        }

        if (insertIndex === -1) {
            throw new Error('Could not find line items table in invoice');
        }

        // Insert the new row
        lines.splice(insertIndex, 0, newRow);

        // Write back to file
        const updatedContent = lines.join('\n');
        await this.app.vault.modify(file, updatedContent);

        console.log(`[TabulaBridge] ✅ Appended to ${file.basename}: "${description.slice(0, 50)}..."`);
    }

    /**
     * Create a sync result object.
     */
    private createResult(
        success: boolean,
        invoicePath: string | null,
        lineItemDescription: string,
        error: string | null,
        timestamp: string
    ): SyncResult {
        return { success, invoicePath, lineItemDescription, error, timestamp };
    }

    /**
     * Log a sync transaction for audit purposes.
     */
    private async logTransaction(result: SyncResult): Promise<void> {
        this.syncLog.push(result);

        // Log to console
        if (result.success) {
            console.log(`[TabulaBridge] ✅ ${result.timestamp}: "${result.lineItemDescription.slice(0, 50)}" → ${result.invoicePath}`);
        } else {
            console.error(`[TabulaBridge] ❌ ${result.timestamp}: "${result.lineItemDescription.slice(0, 50)}" - ${result.error}`);
        }

        // Append to sync log file
        try {
            const logEntry = `| ${result.timestamp.slice(0, 19)} | ${result.success ? '✅' : '❌'} | ${result.lineItemDescription.slice(0, 60).replace(/\|/g, '/')} | ${result.invoicePath || 'N/A'} | ${result.error || ''} |\n`;

            const logFile = this.app.vault.getAbstractFileByPath(TRANSACTION_LOG_PATH);

            if (logFile instanceof TFile) {
                const content = await this.app.vault.read(logFile);
                await this.app.vault.modify(logFile, content + logEntry);
            } else {
                // Create new log file
                const header = `# Portus → Tabula Sync Log\n\n| Timestamp | Status | Task | Invoice | Error |\n|:----------|:------:|:-----|:--------|:------|\n`;
                await this.app.vault.create(TRANSACTION_LOG_PATH, header + logEntry);
            }
        } catch (e) {
            console.warn('[TabulaBridge] Failed to write to sync log:', e);
        }
    }

    /**
     * Get recent sync results (for debugging).
     */
    getRecentSyncs(count: number = 10): SyncResult[] {
        return this.syncLog.slice(-count);
    }
}
