const config = require('./config').getConfig();
const removeMd = require('remove-markdown');


function replaceAll(str, find, newToken = '', ignoreCase = false) {
    if (find === null || find === undefined || find === '') return str;

    if (ignoreCase) {
        // Escape special regex characters in 'find'
        const escapedFind = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedFind, 'gi');
        return str.replace(regex, newToken);
    } else {
        return str.replaceAll(find, newToken);
    }
}

/**
 * Function that takes a string and then returns a "dumbed down" version 
 * of it. Without smart quotes, etc.
 * @todo we need to strip accents, umlats, etc.
 * @param {string} strInput the input. 
 * @returns a cleaned version of the string.
 */
const cleanseString = (strInput) => strInput
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, '\'')
    .replace(/\u2026/g, '...')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--');

/// because javascript gonna be javascript about this we can't use a lambda ere
String.prototype.unicodeToMerica = function () { 
    return cleanseString(this); 
};

/// Lets remove the markdown
String.prototype.deMarkDown = function () { 
    const userExtractedString = extractUsers(this);
    let replacePhrase = extractGtAndLt(userExtractedString.cleansed);
    replacePhrase = removeMd(replacePhrase)
        .replace('{LESS_THAN}', '<')
        .replace('{GREATER_THAN}', '>');
    userExtractedString.users?.forEach(user => {
        replacePhrase = replacePhrase.replace('|{|user|}|', user);
    });
    return replacePhrase;
};

/**
 * Takes a string as input and outputs an object with two properties: `cleansed` and `urls`.
 * The `cleansed` property contains the original string but with all URLs replaced with `|{|url|}|`.
 * The `urls` property is an array of all removed URLs.
 *
 * @param {string} inputString - The input string to cleanse.
 * @returns {{cleansed: string, urls: string[]}} - An object with two properties: `cleansed` and `urls`.
 */
function extractUrls(inputString) {
    const urlRegex = /((https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)/gi;
    const urls = inputString.match(urlRegex);
    const cleansed = inputString.replace(urlRegex, '|{|url|}|');
    return { cleansed, urls };
}

/**
 * Takes a string as input and outputs an object with two properties: `cleansed` and `USERS`.
 * The `cleansed` property contains the original string but with all users replaced with `|{|user|}|`.
 * The `users` property is an array of all removed users.
 *
 * @param {string} inputString - The input string to cleanse.
 * @returns {{cleansed: string, urls: string[]}} - An object with two properties: `cleansed` and `urls`.
 */
function extractUsers(inputString) {
    const userRegex = /<@[0-9]+>/gi;
    const users = inputString.match(userRegex);
    const cleansed = inputString.replace(userRegex, '|{|user|}|');
    return { cleansed, users };
}

/**
 * Takes a string as input and replaces all balanced < and > symols with {LESS_THAN} and {GREATER_THAN}.
 *
 * @param {string} inputString - The input string to cleanse.
 * @returns {string} - The cleansed string.
 */
function extractGtAndLt(inputString) {
    const userRegex = /<(.*)>/gi;
    const cleansed = inputString.replace(userRegex, '{LESS_THAN}$1{GREATER_THAN}');
    return cleansed;
}

/**
 * Does a replace on the first message that matches regex
 * 
 * @param {{content: string}[]} messages the messages to search through 
 * @param {string|regex} regex the search string or regex
 * @param {string} replacement the replacement 
 * @param {send: function} channel the channel send message
 * 
 * @returns {boolean}
 */
function replaceFirstMessage(messages, regex, replacement, channel) {
    if(! regex.toLocaleLowerCase) {
        return true;
    }
    
    const lowerCaseSearch = regex.toLocaleLowerCase();

    return messages.every(msg => {
        if(msg.author.bot || msg.content.toString().indexOf('!s') > -1) {
            console.debug('Ignoring message from bot or search message');
            return true;
        }
        const cleansedMessage = extractUrls(msg.content.unicodeToMerica().deMarkDown());
        if(cleansedMessage.cleansed.toLocaleLowerCase().includes(lowerCaseSearch)) {
            console.log(`Match found for message "${msg.content}" with regex "${regex}"`);
            let replacePhrase = '';
            if (typeof replacement === 'string' && replacement.length > 0) {
                // Use replacement if it's a non-empty string
                replacePhrase = replaceAll(cleansedMessage.cleansed, regex, '\v' + replacement + '\v', true)
                    .replace('\v\v', '')
                    .replace(/\v/g, '**');
            } else {
                // For empty string, null, undefined, false, 0, remove the matched phrase
                replacePhrase = replaceAll(cleansedMessage.cleansed, regex, '', true);
            }
            cleansedMessage.urls?.forEach(url => {
                replacePhrase = replacePhrase.replace('|{|url|}|', url);
            });
            channel.send(msg.author.toString() + ' ' + replacePhrase);
            return false;
        } else {
            console.debug(`Message '${msg.content}' did not match search string '${regex}'`);
            return true;
        }
    });

}

/**
 * Takes the replace message and turn it into a searh regex and a replace message
 * 
 * @param {string} replaceCommand 
 * @returns {{search:RegExp, isBlockedPhrase:boolean, replacement:string}}
 */
function splitReplaceCommand(replaceCommand) {
    var response = replaceCommand.replace(/!s /, '').split('/');
    const search = response[0].unicodeToMerica();
    const replacement = response[1];

    return {
        search,
        isBlockedPhrase: isBlockedSearchPhrase(response[0]) || isBlockedSearchPhrase(replacement),
        replacement
    };
}

/**
 * Indicates if a phrase is blocekd from search and replace.
 * @param {string} phrase The phrase to check to see if its blocked.
 * @returns true if the phrase is blocked. False otherwise.
 */
function isBlockedSearchPhrase(phrase) {
    return config
        .SearchPhrasesToBlock
        .findIndex(blockedPhrase => phrase.match(new RegExp(blockedPhrase.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), 'iu'))) > -1;
}

module.exports = {
    extractUrls,
    replaceFirstMessage,
    splitReplaceCommand
};