#!/usr/bin/env python3
import os
import re
from pathlib import Path
from typing import Any, Dict

import yaml


def substitute_env_vars(text: str) -> str:
    """
    Substitute environment variables in text using ${VAR:-default} syntax.

    PyYAML doesn't do this automatically, so we implement it explicitly.

    Examples:
        ${VAR} - Replace with env var VAR, empty string if not set
        ${VAR:-default} - Replace with env var VAR, or 'default' if not set
    """
    def replacer(match):
        expr = match.group(1)
        if ":-" in expr:
            var_name, default = expr.split(":-", 1)
            return os.environ.get(var_name, default)
        return os.environ.get(expr, "")

    return re.sub(r'\$\{([^}]+)\}', replacer, text)


def load_config() -> Dict[str, Any]:
    """
    Load ETL configuration from YAML file with env var substitution.

    Returns:
        Dictionary with full configuration including datasets, ckan, storage, gcp sections
    """
    config_path = Path(__file__).parent / "config.yaml"

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        config_text = f.read()

    # Substitute environment variables before parsing YAML
    config_text = substitute_env_vars(config_text)

    config = yaml.safe_load(config_text)

    return config


def get_dataset_config(dataset_name: str) -> Dict[str, Any]:
    """
    Get configuration for a specific dataset.

    Args:
        dataset_name: Name of dataset (e.g., 'council_voting', 'capital_by_ward')

    Returns:
        Dictionary with dataset config, merged with global CKAN settings

    Raises:
        ValueError: If dataset not found in config
    """
    config = load_config()

    dataset_config = config.get("datasets", {}).get(dataset_name)

    if not dataset_config:
        available = ', '.join(config.get("datasets", {}).keys())
        raise ValueError(
            f"Dataset '{dataset_name}' not found in config. "
            f"Available datasets: {available}"
        )

    # Merge with global CKAN config for convenience
    dataset_config["ckan_base_url"] = config["ckan"]["base_url"]
    dataset_config["ckan_timeout"] = config["ckan"]["timeout"]
    dataset_config["ckan_download_timeout"] = config["ckan"].get("download_timeout", config["ckan"]["timeout"])
    dataset_config["raw_dir"] = config["storage"]["raw_dir"]
    dataset_config["processed_dir"] = config["storage"]["processed_dir"]
    dataset_config["gold_dir"] = config["storage"]["gold_dir"]

    return dataset_config


def get_gcs_path(dataset_name: str, metadata: Dict[str, Any]) -> str:
    """
    Generate GCS path from template and metadata.

    Args:
        dataset_name: Name of dataset
        metadata: Dictionary with year/decade information (e.g., year_start, fiscal_year)

    Returns:
        Full GCS path (e.g., 'gs://bucket/capital/2020-2029/capital_by_ward.json')
    """
    config = load_config()

    dataset_config = config["datasets"][dataset_name]
    template = dataset_config["gcs_path_template"]

    # Replace template variables
    path = template.format(**metadata)

    bucket = config["gcp"]["bucket_name"]
    return f"gs://{bucket}/{path}"
