'use-strict';

function ValidationError(instance, errors) {

    this.name = 'ElasticSearchValidationError';
    this.message = errors.join(',');
    this.stack = (new Error()).stack;
    this.errors = errors;
}

ValidationError.prototype = Object.create(Error.prototype);
ValidationError.prototype.constructor = ValidationError;

module.exports = ValidationError;
