import fs from 'fs'
import {join, resolve} from 'path'
import yaml from 'js-yaml'
import endent from 'endent'
import urlParse from 'url-parse'

import validateRequirements from './validate-requirements'
import getSitePages from './get-site-pages'

import type Requirements from '../__types__/Requirements'
import type Requirement from '../__types__/Requirement'

export type Platform = 'jammy' | 'windows' | 'rhel' | 'focal'
export type Dds = 'fastdds' | 'cyclone' | 'connext'
export type InstallType = 'binary' | 'source'

export async function getRequirements(
  inputRequirementsPath: string,
  outputRequirementsPath: string,
) {
  await makeDocumentationRequirementFiles(outputRequirementsPath)
  copyRequirementFiles(inputRequirementsPath, outputRequirementsPath)
}

function copyRequirementFiles(inputPath: string, outputPath: string) {
  const requirementNames = new Set<string>()
  fs.readdirSync(inputPath).forEach((file) => {
    const filePath = join(inputPath, file)
    const requirementsYaml = yaml.load(
      fs.readFileSync(filePath, 'utf8'),
    ) as Requirements

    validateRequirementsYaml(requirementsYaml)

    // Check if there are any duplicate requirement names
    requirementsYaml.requirements.forEach((requirement) => {
      if (requirementNames.has(requirement.name)) {
        console.error(
          `ERROR: ${requirement.name} is duplicated requirement name: ${filePath}`,
        )
        process.exit(1)
      } else {
        requirementNames.add(requirement.name)
      }
    })

    const outputFilePath = join(outputPath, file)
    const outText = endent`
      # The original file was located here: ${resolve(filePath)}
      #
      # This test case has been validated

      ${yaml.dump(requirementsYaml)}
    `

    errorIfFileExists(outputFilePath)
    fs.writeFileSync(outputFilePath, outText)
  })
}

async function makeDocumentationRequirementFiles(
  outputDirectory: string,
  distro = 'rolling',
  baseUrl = 'https://docs.ros.org/en/',
  sections: string[] = ['Install', 'Tutorials', 'How-to-guide'],
) {
  const pages = await getSitePages(distro, baseUrl, sections)
  const requirements = pages.map((page) => {
    const out: Requirement = {
      name: page.name,
      labels: page.labels,
      description: `Check the documentation for the '${page.name}' page`,
      links: [
        {
          name: `${page.name} page`,
          url: page.url,
        },
      ],
      checks: [
        {
          name: 'I was able to follow the documentation.',
        },
        {
          name: 'The documentation seemed clear to me.',
        },
        {
          name: "The documentation didn't have any obvious errors.",
        },
      ],
    }
    return out
  })
  const text = endent`
    # This test case was generated by scraping ${baseUrl} on ${distro} for the following sections:
    ${sections.map((s) => `# - ${s}`).join('\n')}
    #
    # This test case has been validated

    ${yaml.dump({requirements})}
  `
  const requirementsYaml = yaml.load(text)
  validateRequirementsYaml(requirementsYaml)

  const host = urlParse(baseUrl).host
  const outputFile = join(outputDirectory, `${host}.yaml`)

  errorIfFileExists(outputFile)
  fs.writeFileSync(outputFile, text)
}

function validateRequirementsYaml(loadedText: unknown) {
  const error = validateRequirements(loadedText)
  if (error) {
    console.error(error)
    console.error(`ERROR: Couldn't validate requirements`)
    process.exit(1)
  }
}

function errorIfFileExists(filePath: string) {
  if (fs.existsSync(filePath)) {
    console.error(`ERROR: file already exists: ${filePath}`)
    process.exit(1)
  }
}
