# -*- coding: utf-8 -*-

from odoo import models, fields, api


class InventoryHistory(models.Model):
    _name = 'inventory.history_8070'
    _description = 'Inventory History 8070'
    _order = 'create_date desc'

    # Basic Information
    store_name = fields.Char(
        string='Store Name',
        required=True,
        help='Name of the store conducting inventory'
    )
    user_name = fields.Char(
        string='Operator Name',
        required=True,
        help='Name of the operator performing inventory'
    )
    inventory_date = fields.Datetime(
        string='Inventory Date',
        required=True,
        default=fields.Datetime.now,
        help='Date and time when inventory started'
    )
    
    # Device Statistics
    total_devices = fields.Integer(
        string='Total Devices',
        required=True,
        help='Total number of devices to be inventoried'
    )
    scan_count = fields.Integer(
        string='Scan Count',
        default=0,
        help='Number of devices selected by scanning'
    )
    manual_count = fields.Integer(
        string='Manual Count',
        default=0,
        help='Number of devices selected manually'
    )
    
    # Computed Fields
    scan_rate = fields.Float(
        string='Scan Rate (%)',
        digits=(5, 2),
        compute='_compute_scan_rate',
        store=True,
        help='Percentage of devices selected by scanning'
    )
    duration_minutes = fields.Integer(
        string='Duration (Minutes)',
        help='Total time from start to completion of inventory'
    )
    
    # Other Information
    notes = fields.Text(
        string='Notes',
        help='Additional notes during inventory process'
    )

    @api.depends('scan_count', 'manual_count')
    def _compute_scan_rate(self):
        """Compute scan rate"""
        for record in self:
            total = record.scan_count + record.manual_count
            if total > 0:
                record.scan_rate = (record.scan_count / total) * 100
            else:
                record.scan_rate = 0.0

    @api.model
    def create(self, vals):
        """Handle record creation"""
        # Auto calculate scan rate
        if 'scan_count' in vals and 'manual_count' in vals:
            total = vals['scan_count'] + vals['manual_count']
            if total > 0:
                vals['scan_rate'] = (vals['scan_count'] / total) * 100
            else:
                vals['scan_rate'] = 0.0
        
        return super(InventoryHistory, self).create(vals)

    def write(self, vals):
        """Handle record updates"""
        # Recalculate scan rate if scan or manual count is updated
        if 'scan_count' in vals or 'manual_count' in vals:
            for record in self:
                scan_count = vals.get('scan_count', record.scan_count)
                manual_count = vals.get('manual_count', record.manual_count)
                total = scan_count + manual_count
                if total > 0:
                    vals['scan_rate'] = (scan_count / total) * 100
                else:
                    vals['scan_rate'] = 0.0
                break
        
        return super(InventoryHistory, self).write(vals)