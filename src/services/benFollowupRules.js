'use strict';
/* Ben's follow-up messages and the rules for reading a student's reply. Pure: no database, no network.
   A reply closes the follow-up only when it is clearly a yes. Anything with a negation or unclear wording goes to staff. */

const NEGATION = /\b(not|no|never|don'?t|do not|stop|can'?t|cannot|moving|moved|won'?t|unable)\b/i;
const AFFIRMATIVE = /^\s*(yes|y|yeah|yep|yup|sure|ok|okay)\b|\b(i'?ll|i will|i'?m|i am|will)\s+(be\s+)?(back|coming|come)\b|\bcoming back\b/i;
const OPT_OUT = /\b(stop|unsubscribe|opt out)\b/i;

const isOptOut = text => OPT_OUT.test(String(text || ''));
const isAffirmative = text => {
  const t = String(text || '');
  return AFFIRMATIVE.test(t) && !NEGATION.test(t);
};

const firstName = fullName => String(fullName || '').trim().split(/\s+/)[0] || 'there';

const MESSAGES = {
  newcomer: name => `Hi ${name}, we hope you enjoyed your first classes at Aikido Shinju-Kai. We haven't seen you in a while. Are you planning to come back? Reply YES if you are, or tell us here if something is getting in the way.`,
  declining: name => `Hi ${name}, we've missed you at Aikido Shinju-Kai. Are you planning to come back to class soon? Reply YES if you are, or tell us here if something is getting in the way.`
};

const outreachText = (kind, fullName) => MESSAGES[kind](firstName(fullName));

module.exports = { isAffirmative, isOptOut, outreachText, firstName };
