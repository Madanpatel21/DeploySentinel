terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

resource "aws_kms_key" "releaseguard_secrets" {
  description             = "ReleaseGuard envelope encryption key (${var.environment})"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_s3_bucket" "sbom_audit_archive" {
  bucket = "releaseguard-sbom-audit-${var.environment}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "sbom_enc" {
  bucket = aws_s3_bucket.sbom_audit_archive.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.releaseguard_secrets.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "sbom_private" {
  bucket                  = aws_s3_bucket.sbom_audit_archive.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
