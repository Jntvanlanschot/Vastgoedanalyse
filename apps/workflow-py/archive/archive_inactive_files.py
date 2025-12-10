#!/usr/bin/env python3
"""
Script to archive inactive files in the workflow-py directory.

This script identifies files that are NOT actively used in the production workflow
and moves them to an Archive directory.
"""

import shutil
from pathlib import Path
import os

# Define the base directory
BASE_DIR = Path(__file__).parent

# ACTIVE FILES - These are used in production and should NOT be archived
ACTIVE_FILES = {
    # Core workflow files
    'workflow/api_workflow.py',
    'workflow/step1_reference_processing.py',
    'workflow/step2_realworks_processing.py',
    'workflow/step3_merge_and_select.py',
    'workflow/step4_generate_reports.py',
    'workflow/energy_label_correction.py',
    'workflow/optimized_weights.py',
    'workflow/overpass_street_similarity.py',
    
    # Realworks parsers
    'parse_realworks_perfect.py',
    'parse_realworks_pdf.py',
    'parse_realworks_mhtml.py',
    
    # Configuration and documentation
    'requirements.txt',
    'README.md',
    'workflow/README.md',
    
    # Test table styles (useful for future styling)
    'test_table_styles.py',
}

# ACTIVE DIRECTORIES - These should NOT be archived
ACTIVE_DIRECTORIES = {
    'workflow/outputs',  # Generated outputs
    'workflow/cache',    # Cache files
    '__pycache__',       # Python cache (will be regenerated)
}

# FILES TO ARCHIVE - Patterns and specific files
FILES_TO_ARCHIVE = [
    # Test files
    'test_*.py',
    'test_*.json',
    
    # Debug files
    'debug_*.py',
    
    # Extract scripts (old image extraction methods)
    'extract_*.py',
    
    # Old workflow scripts
    'workflow/api_workflow_with_realworks.py',
    'workflow/api_workflow_streets_only.py',
    'workflow/complete_workflow.py',
    'workflow/test_overpass_similarity.py',
    'workflow/test_ref.json',
    'workflow/example_reference_data.json',
    
    # Old standalone scripts
    'create_perfect_excel_table.py',
    'find_top15_perfect.py',
    'generate_perfect_pdf_report.py',
    'get_top5_streets.py',
    'merge_perfect.py',
    'inspect_rtf.py',
    'create_price_calculation_doc.py',
    
    # Log files
    '*.log',
    'optimization_*.txt',
    'tuning_*.log',
    
    # Output previews (can be regenerated)
    'outputs/table_styles_preview.pdf',
]

# DIRECTORIES TO ARCHIVE
DIRECTORIES_TO_ARCHIVE = [
    'parameter_tuning',
    'parameter_tuning_results',
    'parameter_tuning_results_enhanced',
    'parameter_tuning_results_enhanced_fast',
    'parameter_tuning_results_enhanced_final',
    'parameter_tuning_results_full',
    'parameter_tuning_results_full_weights',
    'parameter_tuning_results_improved',
    'parameter_tuning_results_test',
    'parameter_tuning_results_with_date',
]

def matches_pattern(filename, pattern):
    """Check if filename matches a pattern (supports * wildcard)."""
    if '*' in pattern:
        import fnmatch
        return fnmatch.fnmatch(filename, pattern)
    return filename == pattern

def should_archive(file_path: Path, relative_path: str) -> bool:
    """Determine if a file should be archived."""
    # Check if it's in the active files list
    if relative_path in ACTIVE_FILES:
        return False
    
    # Check if it's in an active directory
    for active_dir in ACTIVE_DIRECTORIES:
        if relative_path.startswith(active_dir + '/'):
            return False
    
    # Check if it matches any archive pattern
    filename = file_path.name
    for pattern in FILES_TO_ARCHIVE:
        if matches_pattern(filename, pattern) or matches_pattern(relative_path, pattern):
            return True
    
    # Check if it's in a directory to archive
    for archive_dir in DIRECTORIES_TO_ARCHIVE:
        if relative_path.startswith(archive_dir + '/'):
            return True
    
    return False

def main():
    """Main function to archive inactive files."""
    archive_dir = BASE_DIR / 'Archive'
    archive_dir.mkdir(exist_ok=True)
    
    print("=" * 60)
    print("ARCHIVING INACTIVE FILES")
    print("=" * 60)
    print(f"\nBase directory: {BASE_DIR}")
    print(f"Archive directory: {archive_dir}\n")
    
    files_to_archive = []
    dirs_to_archive = []
    
    # Scan for files to archive
    for root, dirs, files in os.walk(BASE_DIR):
        # Skip Archive directory itself
        if 'Archive' in root:
            continue
        
        # Skip __pycache__ and venv directories
        dirs[:] = [d for d in dirs if d not in ['__pycache__', 'venv', 'Archive', '.git']]
        
        root_path = Path(root)
        for file in files:
            file_path = root_path / file
            relative_path = file_path.relative_to(BASE_DIR)
            relative_str = str(relative_path).replace('\\', '/')
            
            if should_archive(file_path, relative_str):
                files_to_archive.append((file_path, relative_str))
    
    # Scan for directories to archive
    for archive_dir_name in DIRECTORIES_TO_ARCHIVE:
        dir_path = BASE_DIR / archive_dir_name
        if dir_path.exists() and dir_path.is_dir():
            dirs_to_archive.append((dir_path, archive_dir_name))
    
    # Print summary
    print(f"Files to archive: {len(files_to_archive)}")
    print(f"Directories to archive: {len(dirs_to_archive)}\n")
    
    if not files_to_archive and not dirs_to_archive:
        print("No files to archive!")
        return
    
    # Show what will be archived
    print("FILES TO ARCHIVE:")
    print("-" * 60)
    for file_path, relative_str in sorted(files_to_archive):
        print(f"  {relative_str}")
    
    if dirs_to_archive:
        print("\nDIRECTORIES TO ARCHIVE:")
        print("-" * 60)
        for dir_path, dir_name in sorted(dirs_to_archive):
            print(f"  {dir_name}/")
    
    # Ask for confirmation
    print("\n" + "=" * 60)
    response = input("Archive these files? (yes/no): ").strip().lower()
    
    if response not in ['yes', 'y']:
        print("Cancelled.")
        return
    
    # Archive files
    archived_count = 0
    for file_path, relative_str in files_to_archive:
        try:
            # Create archive subdirectory structure
            archive_file_path = archive_dir / relative_str
            archive_file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Move file
            shutil.move(str(file_path), str(archive_file_path))
            print(f"✓ Archived: {relative_str}")
            archived_count += 1
        except Exception as e:
            print(f"✗ Error archiving {relative_str}: {e}")
    
    # Archive directories
    for dir_path, dir_name in dirs_to_archive:
        try:
            archive_dir_path = archive_dir / dir_name
            if archive_dir_path.exists():
                # If already exists, merge contents
                print(f"⚠ Archive directory {dir_name} already exists, skipping...")
            else:
                shutil.move(str(dir_path), str(archive_dir_path))
                print(f"✓ Archived directory: {dir_name}/")
        except Exception as e:
            print(f"✗ Error archiving directory {dir_name}: {e}")
    
    print("\n" + "=" * 60)
    print(f"✓ Archived {archived_count} files and {len(dirs_to_archive)} directories")
    print(f"Archive location: {archive_dir}")
    print("=" * 60)

if __name__ == "__main__":
    main()

