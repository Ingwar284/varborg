/**
 * The sheet for a styled journal page (type "document"). It is Foundry's own
 * rich-text page sheet with one extra strip in edit mode (the look and its
 * extras) and its own view template, which wraps the text in that look.
 */

import { PAGE_STYLES } from "../data/document-page.mjs";

const ProseMirrorSheet = foundry.applications.sheets.journal.JournalEntryPageProseMirrorSheet;

export default class DocumentPageSheet extends ProseMirrorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "vb-document-page"],
    window: { icon: "fa-solid fa-scroll" }
  };

  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    style: { template: "systems/var-borg/templates/journal/document-style.hbs" },
    content: super.EDIT_PARTS.content,
    footer: super.EDIT_PARTS.footer
  };

  static VIEW_PARTS = {
    content: { template: "systems/var-borg/templates/journal/document-view.hbs", root: true }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.page.system;
    context.system = system;
    context.systemFields = this.page.system.schema.fields;
    context.styleChoices = Object.fromEntries(PAGE_STYLES.map(style => [style, `VARBORG.Journal.Style.${style}`]));
    context.styleClass = `vb-page-${system.style}`;
    context.isLetter = system.style === "letter";
    return context;
  }
}
