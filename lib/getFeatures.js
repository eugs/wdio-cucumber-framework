const getFeatures = require('cucumber/lib/cli/helpers').getFeatures;
const _ = require('lodash');
const path = require('path');

async function fixedGetFeatures(options) {
    let initialFeatures = await getFeatures(options),
        templates = _.compact(_.flattenDeep(findTemplates(initialFeatures))),
        featureWithTemplate,
        templatedScenarios,
        pointScenario,
        shift = 0,
        opt;

    //get templated scenarious
    templatedScenarios = await Promise.all(templates.map(async (template) => {
        const templateOptions = options;
        templateOptions.featurePaths = [template.path];
        try {
            let scenarios = await getFeaturesFromTemplate(templateOptions);
            if (template.background) {
                scenarios[0].forEach(scenario => {
                    scenario.steps = template.background.concat(scenario.steps);
                });
            }
            return { scenarios, template };
        } catch (e) {
            throw e;
        }
    }));

    //input templated scenarios into initial features
    templatedScenarios.forEach(templatedScenario => {
        const scenarioIndex = parseInt(templatedScenario.template.scenario) + 1;
        const scenarios = _.flattenDeep(templatedScenario.scenarios);
        if (featureWithTemplate !== templatedScenario.template.feature) {
            featureWithTemplate = templatedScenario.template.feature
            shift = 0;
        }
        pointScenario = initialFeatures[templatedScenario.template.feature].scenarios[templatedScenario.template.scenario];
        opt = {
            uri: pointScenario.uri,
            tags: pointScenario.tags,
            feature: pointScenario.feature,
            lastStep: pointScenario.steps[pointScenario.steps.length - 1].line
        }
        initialFeatures[templatedScenario.template.feature].scenarios.splice(scenarioIndex + shift, 0, ...preparingScenariosForConcat(scenarios, opt));
        shift += scenarios.length;
    });

    const includeTags = options.tags.filter(tag => /^[^~].+$/.test(tag))
    const excludeTags = options.tags.filter(tag => /^~.+$/.test(tag)).map(tag => tag.replace(/~/g, ''))

    //filter features by tags
    return initialFeatures.map(feature => {
        const filteredFeature = feature;
        if (includeTags.length > 0) {
            filteredFeature.scenarios = filteredFeature.scenarios
                .filter(scenario => scenario.tags.find(tag => includeTags.includes(tag.name)))
        }
        if (excludeTags.length > 0) {
            filteredFeature.scenarios = filteredFeature.scenarios
                .filter(scenario => !scenario.tags.find(tag => excludeTags.includes(tag.name)))
        }
        return filteredFeature;
    });
}

/**
 * Creating objects array with points where and what the templates should be inputed 
 * @param {Array} features 
 */
function findTemplates(features) {
    return features.map((feature, fIndex) => {
        let background;
        if (feature.scenarios[0].steps[0].isBackground) {
            background = feature.scenarios[0].steps.filter(step => step.isBackground);
        }
        return feature.scenarios.map((scenario, sIndex) => {
            return scenario.steps.map((step, index) => {
                if (step.name.includes('Using template')) {
                    return {
                        feature: fIndex,
                        scenario: sIndex,
                        stepIndex: index,
                        background: background,
                        path: path.normalize(path.resolve(step.name.replace(/^Using template "([^"]*)"$/g, '$1')))
                    }
                }
            });
        });
    });
};

/**
 * Returns scenarios with specified options
 * @param {Object} options 
 */
async function getFeaturesFromTemplate(options) {
    try {
        const features = await getFeatures(options);
        return features.map(feature => {
            return feature.scenarios
        });
    } catch (e) {
        console.log(e);
        throw e;
    }
}

/**
 * Returns templated scenarios with specific data of parent feature
 * @param {Array} scenarios 
 * @param {Object} options 
 */
function preparingScenariosForConcat(scenarios, options) {
    let emptyLine = parseInt(options.lastStep) + 1;
    return scenarios.map(scenario => {
        scenario.feature = options.feature;
        scenario.uri = options.uri;
        scenario.line = emptyLine++;
        scenario.tags = options.feature.tags.concat(scenario.tags);
        scenario.steps = scenario.steps.map(step => {
            step.line = emptyLine++;
            return step;
        });
        scenario.feature.lastStep = emptyLine - 1;
        return scenario;
    });
}

module.exports = {
  fixedGetFeatures
}