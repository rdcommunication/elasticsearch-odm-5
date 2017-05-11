'use-strict';

var schemaTypes = require('./schema-types'),
  errors = require('./errors'),
  Dot = require('dot-object'),
  Kareem = require('kareem'),
  ValidatorError = errors.ValidatorError,
  ValidationError = errors.ValidationError,
  Model = require('./model');
  _ = require('lodash');

// sets ovverides in dot object
// see https://github.com/rhalff/dot-object/issues/8
var dot = new Dot('.', true);

module.exports = Schema;

function Schema(schema, options) {
  this.fields = {};
  this.methods = {};
  this.statics = {};


  //console.log(schema.contacts);

  if (schema) this.fields = buildFieldsFromSchema(schema).fields;

  this.hooks = new Kareem();

  Object.defineProperty(this, 'options', {
    value: _.merge({}, options),
    configurable: false,
    writable: false
  });
}

Schema.prototype.toMapping = function () {

  var properties = {};

  // TODO use a proper reduce
  var checkLeaf = function (obj, path) {

    _.forOwn(obj, function (v, k) {

      var currentPath = path ? path + '.' + k : k;

      if (v.type && v.type.esType) {
        var field = {type: v.type.esType};
        // we extend the type definition with any user supplied options.
        // these options can be any options listed for Elasticsearch Core Types.
        // see https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-core-types.html
        var defaults = {};

        // NOTE: This is opinionated. Setting to not_analyzed doesn't
        // allow full text search. But since we are trying to be like Mongoose
        // we assume this is most helpful to users as a default. This option
        // can still be overridden in the schema.
        // if (v.type.jsType === String) defaults.index = 'not_analyzed';
        _.assign(field, defaults, v.options);

        // ES2.x: Remove required field if set on schema since ES will throw an "unsupported parameters"
        if (_.has(field, 'required')) {
          delete field.required;
        }

        dot.str(currentPath, field, properties);
      }


      // is it a nested document?
      else if(Array.isArray(v) && v[0] instanceof Schema) {

        // If there is no type, then this is a nested object.
        // Build an Elasticsearch object mapping with nested properties.
        dot.str(currentPath, {type: 'nested'}, properties);
        checkLeaf(v[0].fields, currentPath + '.properties');
      }

      // an object?
      else {
          dot.str(currentPath, {type: 'object'}, properties);
          checkLeaf(v, currentPath + '.properties');
      }
    });
  };

  checkLeaf(this.fields);

  var mapping = {
    properties: properties
  };

  if(this.options.parent){
      mapping._parent = { type: this.options.parent };
  }

  return mapping;
};


// TODO use a proper reduce
Schema.prototype.validate = function (doc, partial) {

  console.log(doc);

  var errs = [];
  var self = this;

  var compareWithOptions = function (field, fieldType, path) {
    if (field) {

      if (fieldType.type.compare(field) === false) {
        errs.push(new ValidatorError(path, "Value '" + field + "' Not of type '" + fieldType.type.esType + '".'));
      }
    } else {
      if (fieldType.options.required && !partial) {
        errs.push(new ValidatorError(path, 'Required field is missing.'));
      }
    }
  };

  var checkType = function (fieldType, path) {

    var docField = dot.pick(path, doc);

    // check if it's an array of items or a single value.
    // check all elements in the array if so.
    if (_.isArray(docField)) {
      _.forEach(docField, function (v) {
        compareWithOptions(v, fieldType, path);
      });
    } else {
      compareWithOptions(docField, fieldType, path);
    }
  };

  var checkLeaf = function (obj, path) {

    if(obj instanceof Schema){
        return obj.validate(dot.pick(path, doc));
    }

    _.forOwn(obj, function (v, k) {
      // build a dot notation path to be used with 'dot-object'
      var currentPath = path ? path + '.' + k : k;

      // if a leaf contains a type property, then it's a type definition
      // otherwise it's a nested document.
      if (v.type) {
        if (_.isPlainObject(v.type) && v.type.type) {
          currentPath = currentPath + '.type';
          v = v.type;
        }
        checkType(v, currentPath);
      } else {
        checkLeaf(v, currentPath);
      }
    });
  };

  checkLeaf(self.fields);

  if (errs.length) {
    return new ValidationError(self, errs);
  } else {
    void 0;
  }
};

Schema.prototype.post = function (name, func) {
  this.hooks.post.apply(this.hooks, arguments);
  return this;
};

Schema.prototype.pre = function (name, func) {
  this.hooks.pre.apply(this.hooks, arguments);
  return this;
};



function valueType(value) {

    if (_.isArray(value)) {

      if (_.isPlainObject(value[0])) {
        return [getType(value[0])];
      }
      else if(value[0] instanceof Schema) {
        return value;
      } else {
        return {type: findType(value[0])};
      }
    }

    else if(_.isPlainObject(value) && !value.type) {
        return getType(value);
    }

    else {

      //normalize to object
      if (!_.isPlainObject(value)) {
          value = {type: value}
      }

      if (_.isArray(value.type)) {
          value.type = value.type[0];
      }

      if (value.type) {
        typeOptions = _.omit(value, 'type');
      }

      return {
        type: findType(value.type),
        options: typeOptions
      }
    }
}

function getType(fieldObj){

  return Object.keys(fieldObj).reduce(function(acc, fieldname){
    var value = fieldObj[fieldname], typeOptions, type;

    acc[fieldname] = valueType(value);
    return acc;
  }, {})
}


function buildFieldsFromSchema(fields) {

  var results = {
    fields: getType(fields)
  }

  //console.log('FIELDS FROM SCHEMA', JSON.stringify(results, null, 2));
  return results;
}

function findType(item) {
  var sType;
  _.forOwn(schemaTypes, function (v, k) {
    if (item === v.jsType || item === v.esType) sType = v;
  });
  return sType;
}
