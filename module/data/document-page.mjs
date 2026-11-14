/**
 * Data for a styled journal page (JournalEntryPage type "document").
 *
 * The words themselves live in the page's own text field, like a core text
 * page, so links, secrets and enrichers all work. This model only holds how
 * the page looks and a few extras that some looks show:
 * - style: fieldJournal, letter, notice or scrap.
 * - subtitle: a line under a notice's heading, or a field journal's date.
 * - signature: the name a letter is signed with.
 * - sealed: a letter shows a wax seal.
 */

const { StringField, BooleanField } = foundry.data.fields;

export const PAGE_STYLES = ["fieldJournal", "letter", "notice", "scrap"];

export default class DocumentPageData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      style: new StringField({ required: true, initial: "fieldJournal", choices: PAGE_STYLES }),
      subtitle: new StringField({ required: true, blank: true, initial: "" }),
      signature: new StringField({ required: true, blank: true, initial: "" }),
      sealed: new BooleanField({ initial: false })
    };
  }
}
